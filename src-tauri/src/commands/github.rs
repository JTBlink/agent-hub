//! GitHub-specific backup setup; requires both independent capabilities.
use crate::commands::git_backup::{classify_git_chain, sync_engine_pref};
use crate::core::{
    error::AppError, git_backup, git_credentials, github_api, skill_store::SkillStore,
};
use std::sync::Arc;
use tauri::State;
#[derive(Debug, Clone, serde::Serialize)]
pub struct GithubBackupConnectResult {
    /// Credential-free HTTPS URL of the backup repository.
    pub url: String,
    pub login: String,
    pub repo_created: bool,
    /// False when a pre-existing PUBLIC repository was connected — the UI
    /// warns; app-created repositories are always private.
    pub repo_private: bool,
    /// True when the remote already has commits — the frontend restores
    /// (clones) instead of initializing a fresh backup.
    pub remote_has_content: bool,
}

/// GitHub guided connect (backup redesign Phase 2, PAT mode): validate the
/// token, find or create the private backup repository, store the token in
/// the local credential store, and save the credential-free URL. The credential store is
/// mandatory here — guided mode never falls back to token-in-URL.
#[tauri::command]
pub async fn github_backup_connect(
    store: State<'_, Arc<SkillStore>>,
    token: String,
    repo_name: String,
) -> Result<GithubBackupConnectResult, AppError> {
    let store = store.inner().clone();
    sync_engine_pref(&store);
    tokio::task::spawn_blocking(move || {
        connect_with_token(&store, token.trim(), repo_name.trim(), "pat")
    })
    .await?
}

/// Shared tail of both connect paths (PAT and Device Flow): validate the
/// token, find/create the repo, keychain the token, save the URL, and probe
/// whether the remote already has content. `method` ("oauth" | "pat") is
/// persisted so the disconnect matrix (§3.1) can point revocation at the
/// right GitHub page.
fn connect_with_token(
    store: &SkillStore,
    token: &str,
    repo_name: &str,
    method: &str,
) -> Result<GithubBackupConnectResult, AppError> {
    if token.is_empty() {
        return Err(AppError::invalid_input("Token is empty"));
    }
    if !github_api::is_valid_repo_name(repo_name) {
        return Err(AppError::invalid_input("Invalid repository name"));
    }

    let proxy_url = store.proxy_url();
    let info = github_api::connect_backup_repo(token, repo_name, proxy_url.as_deref())
        .map_err(AppError::network)?;

    git_credentials::store_credential(
        "github.com",
        &git_credentials::RemoteCredential {
            username: info.login.clone(),
            password: token.to_string(),
        },
    )
    .map_err(|e| AppError::internal(format!("CREDENTIAL_STORE_UNAVAILABLE: {e:#}")))?;

    store
        .set_setting("git_backup_remote_url", &info.url)
        .map_err(AppError::db)?;
    store
        .set_setting("github_auth_method", method)
        .map_err(AppError::db)?;

    let remote_has_content = git_backup::remote_has_heads(&info.url).map_err(classify_git_chain)?;

    Ok(GithubBackupConnectResult {
        url: info.url,
        login: info.login,
        repo_created: info.repo_created,
        repo_private: info.repo_private,
        remote_has_content,
    })
}

#[tauri::command]
pub async fn github_device_flow_start(
    store: State<'_, Arc<SkillStore>>,
) -> Result<github_api::DeviceFlowStart, AppError> {
    let store = store.inner().clone();
    tokio::task::spawn_blocking(move || {
        let proxy_url = store.proxy_url();
        github_api::device_flow_start(proxy_url.as_deref()).map_err(AppError::network)
    })
    .await?
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct GithubDevicePollResult {
    /// "pending" | "slow_down" | "connected"
    pub status: String,
    pub result: Option<GithubBackupConnectResult>,
}

/// One device-flow poll. On authorization the OAuth token stays in the
/// backend: it goes straight through `connect_with_token` into the OS
/// keychain and is never returned to the webview.
#[tauri::command]
pub async fn github_device_flow_poll(
    store: State<'_, Arc<SkillStore>>,
    device_code: String,
    repo_name: String,
) -> Result<GithubDevicePollResult, AppError> {
    let store = store.inner().clone();
    sync_engine_pref(&store);
    tokio::task::spawn_blocking(move || {
        let proxy_url = store.proxy_url();
        match github_api::device_flow_poll(&device_code, proxy_url.as_deref())
            .map_err(AppError::network)?
        {
            github_api::DevicePollOutcome::Pending => Ok(GithubDevicePollResult {
                status: "pending".to_string(),
                result: None,
            }),
            github_api::DevicePollOutcome::SlowDown => Ok(GithubDevicePollResult {
                status: "slow_down".to_string(),
                result: None,
            }),
            github_api::DevicePollOutcome::Authorized { token } => {
                let result = connect_with_token(&store, &token, repo_name.trim(), "oauth")?;
                Ok(GithubDevicePollResult {
                    status: "connected".to_string(),
                    result: Some(result),
                })
            }
        }
    })
    .await?
}
