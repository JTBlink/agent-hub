use super::{credentials, valid_percent, ProviderUsage, UsageProvider, UsageStatus, UsageWindow};
use serde_json::Value;
use std::time::Duration;

const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
const MAX_RESPONSE_BYTES: usize = 1024 * 1024;

pub(super) async fn query(proxy: Option<&str>) -> ProviderUsage {
    match fetch(proxy).await {
        Ok(snapshot) => snapshot,
        Err(status) => ProviderUsage::empty(UsageProvider::Claude, status),
    }
}

async fn fetch(proxy: Option<&str>) -> Result<ProviderUsage, UsageStatus> {
    // An API key or alternate endpoint is not a Claude subscription quota.
    if std::env::var("ANTHROPIC_BASE_URL").is_ok_and(|url| {
        !url.is_empty() && url.trim_end_matches('/') != "https://api.anthropic.com"
    }) || ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"]
        .iter()
        .any(|key| std::env::var_os(key).is_some_and(|v| !v.is_empty()))
    {
        return Err(UsageStatus::Unsupported);
    }
    let config = credentials::config_directory("CLAUDE_CONFIG_DIR", ".claude")?;
    if credentials::claude_uses_api_config(&config).await? {
        return Err(UsageStatus::Unsupported);
    }
    let token = credentials::claude_token(&config).await?;
    let mut builder = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .redirect(reqwest::redirect::Policy::none());
    if let Some(proxy) = proxy {
        builder = builder.proxy(reqwest::Proxy::all(proxy).map_err(|_| UsageStatus::NetworkError)?);
    }
    let client = builder.build().map_err(|_| UsageStatus::NetworkError)?;
    request_usage(&client, USAGE_URL, &token).await
}

async fn request_usage(
    client: &reqwest::Client,
    url: &str,
    token: &str,
) -> Result<ProviderUsage, UsageStatus> {
    let mut response = client
        .get(url)
        .bearer_auth(token)
        .header("anthropic-beta", "oauth-2025-04-20")
        .header("User-Agent", "claude-code/2.1.0")
        .send()
        .await
        .map_err(|_| UsageStatus::NetworkError)?;
    match response.status().as_u16() {
        200 => {}
        401 => return Err(UsageStatus::AuthExpired),
        403 => return Err(UsageStatus::PermissionDenied),
        429 => {
            let mut snapshot =
                ProviderUsage::empty(UsageProvider::Claude, UsageStatus::RateLimited);
            snapshot.retry_after_seconds = Some(
                response
                    .headers()
                    .get("retry-after")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(300)
                    .clamp(15, 86400),
            );
            return Ok(snapshot);
        }
        _ => return Err(UsageStatus::QueryFailed),
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| UsageStatus::NetworkError)?
    {
        if bytes.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err(UsageStatus::InvalidResponse);
        }
        bytes.extend_from_slice(&chunk);
    }
    let data: Value = serde_json::from_slice(&bytes).map_err(|_| UsageStatus::InvalidResponse)?;
    parse(&data)
}

fn parse(data: &Value) -> Result<ProviderUsage, UsageStatus> {
    if !data.is_object() {
        return Err(UsageStatus::InvalidResponse);
    }
    let mut windows = Vec::new();
    for (key, minutes) in [
        ("five_hour", 300),
        ("seven_day", 10080),
        ("seven_day_sonnet", 10080),
        ("seven_day_opus", 10080),
    ] {
        let Some(raw) = data.get(key).filter(|v| !v.is_null()) else {
            continue;
        };
        let percent = valid_percent(&raw["utilization"]).ok_or(UsageStatus::InvalidResponse)?;
        windows.push(UsageWindow {
            key: key.into(),
            used_percent: percent,
            window_minutes: Some(minutes),
            resets_at: raw["resets_at"]
                .as_str()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|d| d.timestamp()),
        });
    }
    Ok(ProviderUsage::ready(UsageProvider::Claude, windows))
}

#[cfg(test)]
mod tests;
