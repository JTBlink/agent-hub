//! Query the installed CLI's documented app-server account API, never a turn.
use super::{valid_percent, ProviderUsage, UsageProvider, UsageStatus, UsageWindow};
use serde_json::{json, Value};
use std::{path::Path, process::Stdio, time::Duration};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader};

const MAX_RPC_BYTES: u64 = 2 * 1024 * 1024;

#[cfg(unix)]
struct ProbeGroup(Option<u32>);
#[cfg(unix)]
impl Drop for ProbeGroup {
    fn drop(&mut self) {
        if let Some(pid) = self.0.take() {
            // A fresh process group includes npm's CLI child as well as its shim.
            unsafe {
                libc::kill(-(pid as i32), libc::SIGKILL);
            }
        }
    }
}

pub(super) async fn query(proxy: Option<&str>) -> ProviderUsage {
    let executable =
        tokio::task::spawn_blocking(|| crate::core::tool_detection::find_command("codex")).await;
    let result = match executable {
        Ok(Some(path)) => query_command(&path, Duration::from_secs(40), proxy).await,
        Ok(None) => Err(UsageStatus::NotInstalled),
        Err(_) => Err(UsageStatus::QueryFailed),
    };
    result.unwrap_or_else(|status| ProviderUsage::empty(UsageProvider::Codex, status))
}

async fn query_command(
    executable: &Path,
    deadline: Duration,
    proxy: Option<&str>,
) -> Result<ProviderUsage, UsageStatus> {
    let mut command = tokio::process::Command::new(executable);
    if let Some(proxy) = proxy {
        reqwest::Proxy::all(proxy).map_err(|_| UsageStatus::NetworkError)?;
        command
            .env("HTTPS_PROXY", proxy)
            .env("HTTP_PROXY", proxy)
            .env("ALL_PROXY", proxy);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.as_std_mut().process_group(0);
    }
    command
        // Override legacy approval settings before config validation; this probe
        // only reads account metadata and must not prompt or permit writes.
        .args([
            "-c",
            "approval_policy=never",
            "-s",
            "read-only",
            "-a",
            "never",
            "app-server",
        ])
        .current_dir(std::env::temp_dir())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let mut child = command.spawn().map_err(|_| UsageStatus::QueryFailed)?;
    #[cfg(unix)]
    let group = ProbeGroup(child.id());
    let result = match (child.stdin.take(), child.stdout.take()) {
        (Some(stdin), Some(stdout)) => tokio::time::timeout(deadline, exchange(stdin, stdout))
            .await
            .unwrap_or(Err(UsageStatus::NetworkError)),
        _ => Err(UsageStatus::QueryFailed),
    };
    // Own only this short-lived probe; reap it on success, failure and timeout.
    #[cfg(unix)]
    drop(group);
    #[cfg(windows)]
    if let Some(pid) = child.id() {
        let mut terminate = tokio::process::Command::new("taskkill");
        terminate
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(0x08000000)
            .kill_on_drop(true);
        let _ = tokio::time::timeout(Duration::from_secs(3), terminate.status()).await;
    }
    let _ = child.kill().await;
    let _ = child.wait().await;
    result
}

async fn send(writer: &mut (impl AsyncWrite + Unpin), message: Value) -> Result<(), UsageStatus> {
    let mut bytes = serde_json::to_vec(&message).map_err(|_| UsageStatus::InvalidResponse)?;
    bytes.push(b'\n');
    writer
        .write_all(&bytes)
        .await
        .map_err(|_| UsageStatus::QueryFailed)?;
    writer.flush().await.map_err(|_| UsageStatus::QueryFailed)
}

async fn response(
    reader: &mut (impl tokio::io::AsyncBufRead + Unpin),
    id: u64,
) -> Result<Value, UsageStatus> {
    let mut line = Vec::new();
    loop {
        line.clear();
        if reader
            .read_until(b'\n', &mut line)
            .await
            .map_err(|_| UsageStatus::QueryFailed)?
            == 0
        {
            return Err(UsageStatus::InvalidResponse);
        }
        // CLI wrappers may print startup notices or blank lines on stdout.
        // Keep scanning within the same total byte/deadline limits.
        let Ok(message) = serde_json::from_slice::<Value>(&line) else {
            continue;
        };
        if message["id"].as_u64() != Some(id) {
            continue;
        }
        if let Some(error) = message.get("error") {
            let text = error["message"].as_str().unwrap_or("").to_ascii_lowercase();
            // Never return the raw RPC error: it can contain identities or tokens.
            return Err(if text.contains("429") || text.contains("rate limit") {
                UsageStatus::RateLimited
            } else if text.contains("401")
                || text.contains("unauthorized")
                || text.contains("expired")
            {
                UsageStatus::AuthExpired
            } else if text.contains("not signed in") || text.contains("authentication required") {
                UsageStatus::SignedOut
            } else if text.contains("403") || text.contains("forbidden") {
                UsageStatus::PermissionDenied
            } else {
                UsageStatus::QueryFailed
            });
        }
        return message
            .get("result")
            .cloned()
            .ok_or(UsageStatus::InvalidResponse);
    }
}

async fn exchange(
    mut writer: impl AsyncWrite + Unpin,
    output: impl AsyncRead + Unpin,
) -> Result<ProviderUsage, UsageStatus> {
    let mut reader = BufReader::new(output.take(MAX_RPC_BYTES));
    send(&mut writer, json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"agent_hub_usage","version":env!("CARGO_PKG_VERSION")}}})).await?;
    response(&mut reader, 1).await?;
    send(&mut writer, json!({"jsonrpc":"2.0","method":"initialized"})).await?;
    send(
        &mut writer,
        json!({"jsonrpc":"2.0","id":2,"method":"account/read","params":{"refreshToken":false}}),
    )
    .await?;
    let account = response(&mut reader, 2).await?;
    let identity = account.get("account").ok_or(UsageStatus::InvalidResponse)?;
    if identity.is_null() {
        return Err(if account["requiresOpenaiAuth"] == false {
            UsageStatus::Unsupported
        } else {
            UsageStatus::SignedOut
        });
    }
    // requiresOpenaiAuth describes the configured model provider, not whether
    // the CLI still has a ChatGPT subscription account whose quota we can read.
    if identity["type"] != "chatgpt" {
        return Err(UsageStatus::Unsupported);
    }
    send(
        &mut writer,
        json!({"jsonrpc":"2.0","id":3,"method":"account/rateLimits/read"}),
    )
    .await?;
    parse(&response(&mut reader, 3).await?)
}

fn parse(data: &Value) -> Result<ProviderUsage, UsageStatus> {
    let limits = data
        .pointer("/rateLimitsByLimitId/codex")
        .filter(|v| v.is_object())
        .or_else(|| data.get("rateLimits").filter(|v| v.is_object()))
        .ok_or(UsageStatus::InvalidResponse)?;
    let mut windows = Vec::new();
    for key in ["primary", "secondary"] {
        let Some(raw) = limits.get(key).filter(|v| !v.is_null()) else {
            continue;
        };
        let used_percent =
            valid_percent(&raw["usedPercent"]).ok_or(UsageStatus::InvalidResponse)?;
        let window_minutes = raw["windowDurationMins"].as_u64().filter(|v| *v > 0);
        let label = match window_minutes {
            Some(300) => "five_hour",
            Some(10080) => "seven_day",
            _ => key,
        };
        windows.push(UsageWindow {
            key: label.into(),
            used_percent,
            window_minutes,
            resets_at: raw["resetsAt"]
                .as_i64()
                .filter(|v| *v > 0 && *v <= 253402300799),
        });
    }
    Ok(ProviderUsage::ready(UsageProvider::Codex, windows))
}

#[cfg(test)]
mod tests;
