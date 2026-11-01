//! Explicit account mutation; never invoked by quota polling or expiry reminders.
use super::{codex, ProviderUsage, UsageStatus};
use serde::Serialize;
use serde_json::json;
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, BufReader};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ResetOutcome {
    Reset,
    AlreadyRedeemed,
    NothingToReset,
    NoCredit,
}

#[derive(Debug, Serialize)]
pub struct ResetResult {
    pub outcome: ResetOutcome,
    pub snapshot: Option<ProviderUsage>,
    pub refresh_error: Option<UsageStatus>,
}

pub(super) async fn consume(
    key: String,
    credit_id: Option<String>,
    proxy: Option<&str>,
) -> Result<ResetResult, UsageStatus> {
    if uuid::Uuid::parse_str(&key).is_err()
        || credit_id
            .as_ref()
            .is_some_and(|id| id.trim().is_empty() || id.len() > 1024)
    {
        return Err(UsageStatus::InvalidResponse);
    }
    let executable =
        tokio::task::spawn_blocking(|| crate::core::tool_detection::find_command("codex"))
            .await
            .map_err(|_| UsageStatus::QueryFailed)?
            .ok_or(UsageStatus::NotInstalled)?;
    codex::run_command(
        &executable,
        Duration::from_secs(40),
        proxy,
        |stdin, stdout| exchange(stdin, stdout, &key, credit_id.as_deref()),
    )
    .await
}

async fn exchange(
    mut writer: impl AsyncWrite + Unpin,
    output: impl AsyncRead + Unpin,
    key: &str,
    credit_id: Option<&str>,
) -> Result<ResetResult, UsageStatus> {
    let mut reader = BufReader::new(output.take(codex::MAX_RPC_BYTES));
    codex::initialize_account(&mut writer, &mut reader).await?;
    let mut params = json!({"idempotencyKey":key});
    if let Some(id) = credit_id {
        params["creditId"] = json!(id);
    }
    codex::send(&mut writer, json!({"jsonrpc":"2.0","id":3,"method":"account/rateLimitResetCredit/consume","params":params})).await?;
    let result = codex::response(&mut reader, 3).await?;
    let outcome = match result["outcome"].as_str() {
        Some("reset") => ResetOutcome::Reset,
        Some("alreadyRedeemed") => ResetOutcome::AlreadyRedeemed,
        Some("nothingToReset") => ResetOutcome::NothingToReset,
        Some("noCredit") => ResetOutcome::NoCredit,
        _ => return Err(UsageStatus::InvalidResponse),
    };
    // Mutation success must remain success even if the follow-up query fails.
    let snapshot = async {
        codex::send(
            &mut writer,
            json!({"jsonrpc":"2.0","id":4,"method":"account/rateLimits/read"}),
        )
        .await?;
        codex::parse(&codex::response(&mut reader, 4).await?)
    }
    .await;
    let (snapshot, refresh_error) = match snapshot {
        Ok(value) => (Some(value), None),
        Err(status) => (None, Some(status)),
    };
    Ok(ResetResult {
        outcome,
        snapshot,
        refresh_error,
    })
}

#[cfg(test)]
mod tests;
