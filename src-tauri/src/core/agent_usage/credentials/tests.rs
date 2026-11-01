use super::*;

#[test]
fn matches_claude_keychain_account_naming_without_exposing_identity() {
    assert_eq!(
        keychain_account(Some("fixture-user".into())),
        "fixture-user"
    );
    assert_eq!(
        keychain_account(Some("user@example.invalid".into())),
        "claude-code-user"
    );
    assert_eq!(keychain_account(None), "claude-code-user");
}

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
