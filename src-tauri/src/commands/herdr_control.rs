use crate::core::{
    error::AppError,
    herdr_control::*,
    herdr_tools::HerdrTools,
    skill_store::SkillStore,
    terminal::{TerminalEvent, TerminalManager, TerminalSession, TerminalSize, TerminalSpec},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{ipc::Channel, State, WebviewWindow};

fn controller(tools: &HerdrTools) -> Result<HerdrControl, AppError> {
    tools
        .detect()
        .map_err(AppError::io)?
        .map(|i| HerdrControl::new(i.path.into()))
        .ok_or_else(|| {
            AppError::not_found(
                "Herdr is not installed; use the terminal Herdr launcher to install it",
            )
        })
}
#[derive(Serialize)]
pub struct Inventory {
    installed: bool,
    sessions: Vec<SessionInfo>,
}
#[tauri::command]
pub async fn herdr_sidebar_keys(window: WebviewWindow) -> Result<String, AppError> {
    super::terminal::owner(&window)?;
    tauri::async_runtime::spawn_blocking(|| {
        crate::core::herdr_control::sidebar_keys().map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn herdr_inventory(
    window: WebviewWindow,
    tools: State<'_, Arc<HerdrTools>>,
) -> Result<Inventory, AppError> {
    super::terminal::owner(&window)?;
    let tools = tools.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let Some(i) = tools.detect().map_err(AppError::io)? else {
            return Ok(Inventory {
                installed: false,
                sessions: vec![],
            });
        };
        Ok(Inventory {
            installed: true,
            sessions: HerdrControl::new(i.path.into())
                .sessions()
                .map_err(AppError::io)?,
        })
    })
    .await?
}
#[tauri::command]
pub async fn herdr_delete_session(
    window: WebviewWindow,
    tools: State<'_, Arc<HerdrTools>>,
    session: String,
) -> Result<(), AppError> {
    super::terminal::owner(&window)?;
    let tools = tools.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        controller(&tools)?
            .delete_session(&session)
            .map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn herdr_snapshot(
    window: WebviewWindow,
    tools: State<'_, Arc<HerdrTools>>,
    session: String,
) -> Result<Snapshot, AppError> {
    super::terminal::owner(&window)?;
    let tools = tools.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        controller(&tools)?.snapshot(&session).map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn herdr_open(
    window: WebviewWindow,
    tools: State<'_, Arc<HerdrTools>>,
    store: State<'_, Arc<SkillStore>>,
    session: String,
    workspace_id: String,
    pane_id: Option<String>,
) -> Result<OpenedWorkspace, AppError> {
    super::terminal::owner(&window)?;
    let tools = tools.inner().clone();
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        controller(&tools)?
            .open(&store, &session, &workspace_id, pane_id.as_deref())
            .map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn herdr_ensure(
    window: WebviewWindow,
    tools: State<'_, Arc<HerdrTools>>,
    store: State<'_, Arc<SkillStore>>,
    session: String,
    project_id: String,
    worktree_path: Option<String>,
) -> Result<OpenedWorkspace, AppError> {
    super::terminal::owner(&window)?;
    let tools = tools.inner().clone();
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        controller(&tools)?
            .ensure(&store, &session, &project_id, worktree_path.as_deref())
            .map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn herdr_action(
    window: WebviewWindow,
    tools: State<'_, Arc<HerdrTools>>,
    target: Target,
    action: Action,
    text: Option<String>,
) -> Result<ActionResult, AppError> {
    super::terminal::owner(&window)?;
    let tools = tools.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        controller(&tools)?
            .action(&target, action, text.as_deref())
            .map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn herdr_start_agent(
    window: WebviewWindow,
    tools: State<'_, Arc<HerdrTools>>,
    target: Target,
    input: NewAgent,
) -> Result<StartedAgent, AppError> {
    super::terminal::owner(&window)?;
    let tools = tools.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        controller(&tools)?
            .start_agent(&target, input)
            .map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn herdr_terminal_create(
    window: WebviewWindow,
    tools: State<'_, Arc<HerdrTools>>,
    store: State<'_, Arc<SkillStore>>,
    manager: State<'_, Arc<TerminalManager>>,
    request: TerminalAttachmentRequest,
    events: Channel<TerminalEvent>,
) -> Result<TerminalSession, AppError> {
    let owner = super::terminal::owner(&window)?;
    let tools = tools.inner().clone();
    let store = store.inner().clone();
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let TerminalAttachmentRequest {
            project_id,
            worktree_path,
            target,
            size,
        } = request;
        let control = controller(&tools)?;
        let cwd =
            crate::core::project_worktrees::directory(&store, &project_id, Some(&worktree_path))
                .map_err(AppError::io)?;
        let command = control
            .attachment(&store, &project_id, &worktree_path, &target)
            .map_err(AppError::io)?;
        manager
            .create(
                &owner,
                TerminalSpec {
                    project_id,
                    cwd,
                    command,
                    integration: None,
                    size,
                },
                move |event| events.send(event).is_ok(),
            )
            .map_err(AppError::io)
    })
    .await?
}
#[derive(Deserialize)]
pub struct TerminalAttachmentRequest {
    project_id: String,
    worktree_path: String,
    target: Target,
    size: TerminalSize,
}
