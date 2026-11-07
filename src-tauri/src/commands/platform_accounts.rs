use crate::core::{
    error::AppError,
    install_cancel::InstallCancelRegistry,
    platforms::accounts::{self, AccountContext, AccountSession, AccountTarget, LoginAccount},
    skill_store::SkillStore,
    task_browser::TaskFailure,
    terminal::{TerminalEvent, TerminalManager, TerminalSession, TerminalSize},
};
use std::sync::Arc;
use tauri::{ipc::Channel, State, Webview};
fn request_key(window: &Webview, id: &str) -> Result<String, TaskFailure> {
    super::terminal::owner(window)
        .map_err(|_| TaskFailure::new("permission", "Account access requires the main window"))?;
    uuid::Uuid::parse_str(id)
        .map_err(|_| TaskFailure::new("invalid_input", "Invalid account request identity"))?;
    Ok(format!("accounts:{}:{id}", window.label()))
}
#[tauri::command]
pub async fn platform_account_contexts(
    window: Webview,
    store: State<'_, Arc<SkillStore>>,
) -> Result<Vec<AccountContext>, AppError> {
    super::terminal::owner(&window)?;
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || accounts::contexts(&store).map_err(AppError::io))
        .await?
}
#[tauri::command]
pub async fn platform_account_list(
    window: Webview,
    store: State<'_, Arc<SkillStore>>,
    registry: State<'_, Arc<InstallCancelRegistry>>,
    target: AccountTarget,
    request_id: String,
) -> Result<Vec<LoginAccount>, TaskFailure> {
    let key = request_key(&window, &request_id)?;
    let registry = registry.inner().clone();
    let cancel = registry.register(&key);
    let store = store.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let accounts = AccountSession::resolve(&store, target.clone())?.list(&cancel)?;
        if accounts
            .iter()
            .any(|account| account.active && account.authenticated)
        {
            accounts::remember(&store, &target)?;
        }
        Ok(accounts)
    })
    .await
    .map_err(|_| TaskFailure::new("internal", "Account query failed"));
    registry.remove(&key);
    result?
}
#[tauri::command]
pub fn platform_account_cancel(
    window: Webview,
    registry: State<'_, Arc<InstallCancelRegistry>>,
    request_id: String,
) -> Result<(), TaskFailure> {
    registry.cancel(&request_key(&window, &request_id)?);
    Ok(())
}
#[tauri::command]
pub async fn platform_account_switch(
    window: Webview,
    store: State<'_, Arc<SkillStore>>,
    target: AccountTarget,
    username: String,
) -> Result<Vec<LoginAccount>, TaskFailure> {
    super::terminal::owner(&window)
        .map_err(|_| TaskFailure::new("permission", "Account access requires the main window"))?;
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = AccountSession::resolve(&store, target)?.switch(&username);
        crate::core::task_browser::clear_identities();
        result
    })
    .await
    .map_err(|_| TaskFailure::new("internal", "Account switch failed"))?
}
#[tauri::command]
pub async fn platform_account_login(
    window: Webview,
    store: State<'_, Arc<SkillStore>>,
    manager: State<'_, Arc<TerminalManager>>,
    target: AccountTarget,
    size: TerminalSize,
    events: Channel<TerminalEvent>,
) -> Result<TerminalSession, AppError> {
    let owner = super::terminal::owner(&window)?;
    let store = store.inner().clone();
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if manager
            .list(&owner)
            .map_err(AppError::io)?
            .iter()
            .any(|session| session.project_id.starts_with("platform-account:") && !session.exited)
        {
            return Err(AppError::invalid_input(
                "Finish the current account login first",
            ));
        }
        manager
            .create_with(
                &owner,
                || {
                    AccountSession::resolve(&store, target)?
                        .login(size)
                        .map_err(Into::into)
                },
                move |event| events.send(event).is_ok(),
            )
            .map_err(AppError::io)
    })
    .await?
}

#[tauri::command]
pub async fn platform_account_token_login(
    window: Webview,
    store: State<'_, Arc<SkillStore>>,
    target: AccountTarget,
    token: String,
) -> Result<Vec<LoginAccount>, TaskFailure> {
    super::terminal::owner(&window)
        .map_err(|_| TaskFailure::new("permission", "Account access requires the main window"))?;
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = AccountSession::resolve(&store, target.clone())?.token_login(&token);
        crate::core::task_browser::clear_identities();
        if result.as_ref().is_ok_and(|accounts| {
            accounts
                .iter()
                .any(|account| account.active && account.authenticated)
        }) {
            accounts::remember(&store, &target)?;
        }
        result
    })
    .await
    .map_err(|_| TaskFailure::new("internal", "Account login failed"))?
}
#[tauri::command]
pub async fn platform_account_forget(
    window: Webview,
    store: State<'_, Arc<SkillStore>>,
    target: AccountTarget,
) -> Result<(), AppError> {
    super::terminal::owner(&window)?;
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        accounts::forget(&store, &target).map_err(AppError::io)
    })
    .await?
}
