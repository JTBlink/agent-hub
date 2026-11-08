use crate::core::{
    error::AppError,
    herdr::control::*,
    herdr::tools::HerdrTools,
    skill_store::SkillStore,
    terminal::{TerminalEvent, TerminalManager, TerminalSession, TerminalSize, TerminalSpec},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{ipc::Channel, State, Webview};

fn controller(tools: &HerdrTools) -> Result<HerdrControl, AppError> {
    tools
        .detect()
        .map_err(AppError::io)?
        .map(|i| HerdrControl::new(i.path.into()))
        .ok_or_else(|| {
            AppError::not_found("Herdr is not installed; install it from the Herdr panel")
        })
}
#[derive(Serialize)]
pub struct Inventory {
    installed: bool,
    sessions: Vec<SessionInfo>,
}
#[tauri::command]
pub async fn herdr_sidebar_keys(window: Webview) -> Result<String, AppError> {
    crate::commands::terminal::owner(&window)?;
    tauri::async_runtime::spawn_blocking(|| {
        crate::core::herdr::control::sidebar_keys().map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn herdr_inventory(
    window: Webview,
    tools: State<'_, Arc<HerdrTools>>,
) -> Result<Inventory, AppError> {
    crate::commands::terminal::owner(&window)?;
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
pub async fn herdr_prepare_session(
    window: Webview,
    tools: State<'_, Arc<HerdrTools>>,
) -> Result<String, AppError> {
    crate::commands::terminal::owner(&window)?;
    let tools = tools.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        controller(&tools)?.prepare_session().map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn herdr_restart_session(
    window: Webview,
    tools: State<'_, Arc<HerdrTools>>,
    session: String,
) -> Result<(), AppError> {
    crate::commands::terminal::owner(&window)?;
    let tools = tools.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        controller(&tools)?
            .restart_session(&session)
            .map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn herdr_delete_session(
    window: Webview,
    tools: State<'_, Arc<HerdrTools>>,
    session: String,
) -> Result<(), AppError> {
    crate::commands::terminal::owner(&window)?;
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
    window: Webview,
    tools: State<'_, Arc<HerdrTools>>,
    session: String,
) -> Result<Snapshot, AppError> {
    crate::commands::terminal::owner(&window)?;
    let tools = tools.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        controller(&tools)?.snapshot(&session).map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn herdr_open(
    window: Webview,
    tools: State<'_, Arc<HerdrTools>>,
    store: State<'_, Arc<SkillStore>>,
    session: String,
    workspace_id: String,
    pane_id: Option<String>,
) -> Result<OpenedWorkspace, AppError> {
    crate::commands::terminal::owner(&window)?;
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
    window: Webview,
    tools: State<'_, Arc<HerdrTools>>,
    store: State<'_, Arc<SkillStore>>,
    session: String,
    project_id: String,
    worktree_path: Option<String>,
    parent_workspace_id: Option<String>,
) -> Result<OpenedWorkspace, AppError> {
    crate::commands::terminal::owner(&window)?;
    let tools = tools.inner().clone();
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let control = controller(&tools)?;
        if let Some(parent) = parent_workspace_id {
            control.open_worktree(
                &store,
                &session,
                &project_id,
                &parent,
                worktree_path
                    .as_deref()
                    .ok_or_else(|| AppError::io("Worktree path is required"))?,
            )
        } else {
            control.ensure(&store, &session, &project_id, worktree_path.as_deref())
        }
        .map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn herdr_action(
    window: Webview,
    tools: State<'_, Arc<HerdrTools>>,
    target: Target,
    action: Action,
    text: Option<String>,
) -> Result<ActionResult, AppError> {
    crate::commands::terminal::owner(&window)?;
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
    window: Webview,
    tools: State<'_, Arc<HerdrTools>>,
    target: Target,
    input: NewAgent,
    created: Channel<Target>,
) -> Result<StartedAgent, AppError> {
    crate::commands::terminal::owner(&window)?;
    let tools = tools.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        controller(&tools)?
            .start_agent_with_created(&target, input, |pane| {
                created.send(pane.clone()).map_err(anyhow::Error::from)?;
                Ok(())
            })
            .map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn herdr_terminal_create(
    window: Webview,
    tools: State<'_, Arc<HerdrTools>>,
    store: State<'_, Arc<SkillStore>>,
    manager: State<'_, Arc<TerminalManager>>,
    request: TerminalAttachmentRequest,
    events: Channel<TerminalEvent>,
) -> Result<TerminalSession, AppError> {
    let owner = crate::commands::terminal::owner(&window)?;
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteWorktreeInput {
    session: String,
    workspace_id: Option<String>,
    project_id: String,
    path: String,
}

#[tauri::command]
pub async fn herdr_delete_worktree(
    window: Webview,
    tools: State<'_, Arc<HerdrTools>>,
    store: State<'_, Arc<SkillStore>>,
    input: DeleteWorktreeInput,
) -> Result<(), AppError> {
    crate::commands::terminal::owner(&window)?;
    let tools = tools.inner().clone();
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(workspace_id) = input.workspace_id {
            controller(&tools)?
                .remove_worktree(
                    &store,
                    &input.session,
                    &workspace_id,
                    &input.project_id,
                    &input.path,
                )
                .map_err(AppError::io)
        } else {
            crate::core::project_worktrees::remove(&store, &input.project_id, &input.path)
                .map_err(AppError::io)
        }
    })
    .await?
}

#[tauri::command]
pub async fn terminal_launch_herdr(
    window: Webview,
    manager: State<'_, Arc<TerminalManager>>,
    tools: State<'_, Arc<crate::core::herdr::tools::HerdrTools>>,
    id: String,
    revision: u64,
) -> Result<bool, AppError> {
    let owner = crate::commands::terminal::owner(&window)?;
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
