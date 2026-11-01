//! Read existing Claude credentials without refreshing or rewriting its login.
use super::UsageStatus;
use std::path::{Path, PathBuf};
use tokio::io::AsyncReadExt;

const MAX_CREDENTIAL_BYTES: u64 = 1024 * 1024;

pub(super) fn config_directory(variable: &str, default: &str) -> Result<PathBuf, UsageStatus> {
    if let Some(path) = std::env::var_os(variable).filter(|p| !p.is_empty()) {
        return Ok(PathBuf::from(path));
    }
    dirs::home_dir()
        .map(|p| p.join(default))
        .ok_or(UsageStatus::CredentialsUnavailable)
}

fn token_from_json(bytes: &[u8]) -> Result<Option<String>, UsageStatus> {
    let json: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|_| UsageStatus::CredentialsUnavailable)?;
    let token = json.pointer("/claudeAiOauth/accessToken");
    match token {
        None | Some(serde_json::Value::Null) => Ok(None),
        Some(serde_json::Value::String(token)) if token.trim().is_empty() => Ok(None),
        Some(serde_json::Value::String(token)) => Ok(Some(token.clone())),
        _ => Err(UsageStatus::CredentialsUnavailable),
    }
}

async fn read_json_file(path: &Path) -> Result<Option<Vec<u8>>, UsageStatus> {
    let metadata = match tokio::fs::metadata(path).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(UsageStatus::CredentialsUnavailable),
    };
    if !metadata.is_file() || metadata.len() > MAX_CREDENTIAL_BYTES {
        return Err(UsageStatus::CredentialsUnavailable);
    }
    let file = tokio::fs::File::open(path)
        .await
        .map_err(|_| UsageStatus::CredentialsUnavailable)?;
    let mut bytes = Vec::new();
    file.take(MAX_CREDENTIAL_BYTES + 1)
        .read_to_end(&mut bytes)
        .await
        .map_err(|_| UsageStatus::CredentialsUnavailable)?;
    if bytes.len() as u64 > MAX_CREDENTIAL_BYTES {
        return Err(UsageStatus::CredentialsUnavailable);
    }
    Ok(Some(bytes))
}

async fn file_token(path: &Path) -> Result<Option<String>, UsageStatus> {
    match read_json_file(path).await? {
        Some(bytes) => token_from_json(&bytes),
        None => Ok(None),
    }
}

pub(super) async fn claude_uses_api_config(config: &Path) -> Result<bool, UsageStatus> {
    let Some(bytes) = read_json_file(&config.join("settings.json")).await? else {
        return Ok(false);
    };
    let settings: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|_| UsageStatus::CredentialsUnavailable)?;
    Ok(settings
        .get("env")
        .and_then(|v| v.as_object())
        .is_some_and(|env| {
            ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"]
                .iter()
                .any(|key| {
                    env.get(*key)
                        .and_then(|v| v.as_str())
                        .is_some_and(|v| !v.is_empty())
                })
                || env
                    .get("ANTHROPIC_BASE_URL")
                    .and_then(|v| v.as_str())
                    .is_some_and(|url| {
                        !url.is_empty() && url.trim_end_matches('/') != "https://api.anthropic.com"
                    })
        }))
}

#[cfg(target_os = "macos")]
async fn keychain_token(config: &Path) -> Result<Option<String>, UsageStatus> {
    use sha2::{Digest, Sha256};
    use unicode_normalization::UnicodeNormalization;
    // Claude scopes custom config directories to a different Keychain service.
    let service = if std::env::var_os("CLAUDE_CONFIG_DIR").is_some_and(|v| !v.is_empty()) {
        let normalized: String = config.to_string_lossy().nfc().collect();
        let hash = format!("{:x}", Sha256::digest(normalized.as_bytes()));
        format!("Claude Code-credentials-{}", &hash[..8])
    } else {
        "Claude Code-credentials".into()
    };
    let account = std::env::var("USER")
        .ok()
        .filter(|value| {
            !value.is_empty()
                && value
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
        })
        .unwrap_or_else(|| "claude-code-user".into());
    tokio::task::spawn_blocking(move || {
        // Reuse the bounded process runner; never surface command output/errors.
        let result = crate::core::cli_process::read_command(
            "/usr/bin/security",
            &[
                "find-generic-password",
                "-s",
                &service,
                "-a",
                &account,
                "-w",
            ],
        );
        match result {
            Ok(raw) if raw.len() as u64 <= MAX_CREDENTIAL_BYTES => {
                token_from_json(raw.trim().as_bytes())
            }
            Err(error) if error.contains("could not be found") => Ok(None),
            _ => Err(UsageStatus::CredentialsUnavailable),
        }
    })
    .await
    .map_err(|_| UsageStatus::CredentialsUnavailable)?
}

pub(super) async fn claude_token(config: &Path) -> Result<String, UsageStatus> {
    #[cfg(target_os = "macos")]
    let keychain = keychain_token(config).await;
    #[cfg(not(target_os = "macos"))]
    let keychain: Result<Option<String>, UsageStatus> = Ok(None);
    if let Ok(Some(token)) = &keychain {
        return Ok(token.clone());
    }
    match file_token(&config.join(".credentials.json")).await {
        Ok(Some(token)) => Ok(token),
        Ok(None) => {
            keychain?;
            Err(UsageStatus::SignedOut)
        }
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn detects_explicit_api_billing_in_claude_settings() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!claude_uses_api_config(dir.path()).await.unwrap());
        let path = dir.path().join("settings.json");
        tokio::fs::write(
            &path,
            br#"{"env":{"ANTHROPIC_BASE_URL":"https://api.anthropic.com/"}}"#,
        )
        .await
        .unwrap();
        assert!(!claude_uses_api_config(dir.path()).await.unwrap());
        tokio::fs::write(&path, br#"{"env":{"ANTHROPIC_AUTH_TOKEN":"fixture-key"}}"#)
            .await
            .unwrap();
        assert!(claude_uses_api_config(dir.path()).await.unwrap());
        tokio::fs::write(
            &path,
            br#"{"env":{"ANTHROPIC_BASE_URL":"https://example.invalid"}}"#,
        )
        .await
        .unwrap();
        assert!(claude_uses_api_config(dir.path()).await.unwrap());
    }

    #[tokio::test]
    async fn reads_only_oauth_and_distinguishes_missing_corrupt_and_oversized_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("credentials.json");
        assert_eq!(file_token(&path).await.unwrap(), None);
        tokio::fs::write(
            &path,
            br#"{"claudeAiOauth":{"accessToken":"fixture-token"},"apiKey":"fixture-key"}"#,
        )
        .await
        .unwrap();
        assert_eq!(
            file_token(&path).await.unwrap().as_deref(),
            Some("fixture-token")
        );
        tokio::fs::write(&path, br#"{"apiKey":"fixture-key"}"#)
            .await
            .unwrap();
        assert_eq!(file_token(&path).await.unwrap(), None);
        tokio::fs::write(&path, b"invalid").await.unwrap();
        assert_eq!(
            file_token(&path).await.unwrap_err(),
            UsageStatus::CredentialsUnavailable
        );
        let file = std::fs::File::create(&path).unwrap();
        file.set_len(MAX_CREDENTIAL_BYTES + 1).unwrap();
        assert_eq!(
            file_token(&path).await.unwrap_err(),
            UsageStatus::CredentialsUnavailable
        );
    }
}
