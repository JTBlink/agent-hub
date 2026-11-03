//! Optional sign-in metadata, never authoritative billing or authentication state.
use super::{credentials, SubscriptionPeriod};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::Value;

pub(super) async fn read(account: &Value) -> Option<SubscriptionPeriod> {
    let directory = credentials::config_directory("CODEX_HOME", ".codex").ok()?;
    let bytes = credentials::read_json_file(&directory.join("auth.json"))
        .await
        .ok()??;
    parse(&bytes, account)
}

fn timestamp(value: &Value) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(value.as_str()?)
        .ok()
        .map(|time| time.timestamp())
        .filter(|time| *time > 0 && *time <= 253402300799)
}

fn parse(bytes: &[u8], account: &Value) -> Option<SubscriptionPeriod> {
    let auth: Value = serde_json::from_slice(bytes).ok()?;
    if auth["auth_mode"]
        .as_str()
        .is_some_and(|mode| mode != "chatgpt")
    {
        return None;
    }
    let token = auth.pointer("/tokens/id_token")?.as_str()?;
    let parts: Vec<_> = token.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    let claims: Value = serde_json::from_slice(&URL_SAFE_NO_PAD.decode(parts[1]).ok()?).ok()?;
    let metadata = claims.get("https://api.openai.com/auth")?;
    // A stale auth.json may coexist with another account in the CLI's Keychain.
    // Do not attach metadata unless the live account and cached identity agree.
    let email = account["email"]
        .as_str()
        .filter(|email| !email.is_empty())?;
    let plan = account["planType"].as_str()?;
    if account["type"] != "chatgpt"
        || claims["email"].as_str() != Some(email)
        || metadata["chatgpt_plan_type"].as_str() != Some(plan)
    {
        return None;
    }
    // This decoded claim is display-only; it grants no access or permissions.
    Some(SubscriptionPeriod {
        active_until: timestamp(&metadata["chatgpt_subscription_active_until"])?,
        last_checked_at: timestamp(&metadata["chatgpt_subscription_last_checked"]),
    })
}

#[cfg(test)]
mod tests;
