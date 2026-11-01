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
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn maps_http_auth_and_cooldown_without_exposing_response_body() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        for (status, expected) in [
            (401, UsageStatus::AuthExpired),
            (403, UsageStatus::PermissionDenied),
            (429, UsageStatus::RateLimited),
        ] {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let url = format!("http://{}", listener.local_addr().unwrap());
            let server = tokio::spawn(async move {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut headers = vec![0; 4096];
                let len = socket.read(&mut headers).await.unwrap();
                let request = String::from_utf8_lossy(&headers[..len]).to_ascii_lowercase();
                assert!(request.contains("authorization: bearer fixture-token"));
                assert!(request.contains("anthropic-beta: oauth-2025-04-20"));
                socket.write_all(format!("HTTP/1.1 {status} Failure\r\nContent-Length: 14\r\nRetry-After: 600\r\nConnection: close\r\n\r\nfixture-secret").as_bytes()).await.unwrap();
            });
            let client = reqwest::Client::builder()
                .no_proxy()
                .timeout(Duration::from_secs(2))
                .build()
                .unwrap();
            let result = request_usage(&client, &url, "fixture-token").await;
            let snapshot =
                result.unwrap_or_else(|status| ProviderUsage::empty(UsageProvider::Claude, status));
            assert_eq!(snapshot.status, expected);
            if status == 429 {
                assert_eq!(snapshot.retry_after_seconds, Some(600));
            }
            assert!(!serde_json::to_string(&snapshot)
                .unwrap()
                .contains("fixture-secret"));
            server.await.unwrap();
        }
    }

    #[test]
    fn parses_zero_usage_and_model_windows_without_turning_absence_into_zero() {
        let snapshot = parse(&json!({"five_hour":{"utilization":0,"resets_at":"2026-11-01T00:00:00Z"},"seven_day":null,"seven_day_sonnet":{"utilization":80.5}})).unwrap();
        assert_eq!(snapshot.status, UsageStatus::Ready);
        assert_eq!(snapshot.windows.len(), 2);
        assert_eq!(snapshot.windows[0].used_percent, 0.0);
        assert_eq!(snapshot.windows[0].resets_at, Some(1793491200));
        assert_eq!(parse(&json!({})).unwrap().status, UsageStatus::NoData);
        for raw in [
            json!({"five_hour":{}}),
            json!({"five_hour":{"utilization":-1}}),
            json!([]),
        ] {
            assert_eq!(parse(&raw).unwrap_err(), UsageStatus::InvalidResponse);
        }
    }
}
