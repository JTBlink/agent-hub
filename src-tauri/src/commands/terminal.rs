use crate::core::{
    error::AppError,
    skill_store::SkillStore,
    terminal::{self, TerminalEvent, TerminalManager, TerminalSession, TerminalSize, TerminalSpec},
};
use std::sync::Arc;
use tauri::{ipc::Channel, State, WebviewWindow};

fn owner(window: &WebviewWindow) -> Result<String, AppError> {
    if window.label() != "main" {
        return Err(AppError::invalid_input(
            "Terminal access requires the main window",
        ));
    }
    Ok(window.label().into())
}
#[tauri::command]
pub async fn terminal_create(
    window: WebviewWindow,
    store: State<'_, Arc<SkillStore>>,
    manager: State<'_, Arc<TerminalManager>>,
    project_id: String,
    size: TerminalSize,
    events: Channel<TerminalEvent>,
) -> Result<TerminalSession, AppError> {
    let owner = owner(&window)?;
    let store = store.inner().clone();
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let cwd = crate::core::project_paths::project_directory(&store, &project_id)
            .map_err(AppError::io)?;
        let (command, integration) = terminal::prepare_shell(None, None).map_err(AppError::io)?;
        manager
            .create(
                &owner,
                TerminalSpec {
                    project_id,
                    cwd,
                    command,
                    integration: Some(integration),
                    size,
                },
                move |event| events.send(event).is_ok(),
            )
            .map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn terminal_write(
    window: WebviewWindow,
    manager: State<'_, Arc<TerminalManager>>,
    id: String,
    data: String,
) -> Result<(), AppError> {
    manager
        .write(&owner(&window)?, &id, data.into_bytes())
        .map_err(AppError::io)
}
#[tauri::command]
pub async fn terminal_resize(
    window: WebviewWindow,
    manager: State<'_, Arc<TerminalManager>>,
    id: String,
    size: TerminalSize,
) -> Result<(), AppError> {
    let owner = owner(&window)?;
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        manager.resize(&owner, &id, size).map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub fn terminal_ack(
    window: WebviewWindow,
    manager: State<'_, Arc<TerminalManager>>,
    id: String,
    seq: u64,
) -> Result<(), AppError> {
    manager
        .ack(&owner(&window)?, &id, seq)
        .map_err(|error| AppError::invalid_input(error.to_string()))
}
#[tauri::command]
pub async fn terminal_close(
    window: WebviewWindow,
    manager: State<'_, Arc<TerminalManager>>,
    id: String,
) -> Result<(), AppError> {
    let owner = owner(&window)?;
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.close(&owner, &id).map_err(AppError::io))
        .await?
}
#[tauri::command]
pub fn terminal_list(
    window: WebviewWindow,
    manager: State<'_, Arc<TerminalManager>>,
) -> Result<Vec<TerminalSession>, AppError> {
    manager.list(&owner(&window)?).map_err(AppError::io)
}

#[tauri::command]
pub fn terminal_launch_state(
    window: WebviewWindow,
    manager: State<'_, Arc<TerminalManager>>,
    id: String,
) -> Result<terminal::LaunchState, AppError> {
    manager
        .launch_state(&owner(&window)?, &id)
        .map_err(AppError::io)
}
#[tauri::command]
pub async fn terminal_launch_herdr(
    window: WebviewWindow,
    manager: State<'_, Arc<TerminalManager>>,
    tools: State<'_, Arc<crate::core::herdr_tools::HerdrTools>>,
    id: String,
    revision: u64,
) -> Result<bool, AppError> {
    let owner = owner(&window)?;
    let manager = manager.inner().clone();
    let tools = tools.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let installed = tools
            .detect()
            .map_err(AppError::io)?
            .ok_or_else(|| AppError::not_found("Herdr is not installed"))?;
        manager
            .launch_herdr(&owner, &id, std::path::Path::new(&installed.path), revision)
            .map_err(AppError::io)
    })
    .await?
}

#[tauri::command]
pub async fn terminal_project_directory(
    window: WebviewWindow,
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
) -> Result<String, AppError> {
    owner(&window)?;
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::core::project_paths::project_directory(&store, &project_id)
            .map(|path| path.to_string_lossy().into_owned())
            .map_err(AppError::io)
    })
    .await?
}
