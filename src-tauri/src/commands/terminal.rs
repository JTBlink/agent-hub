use crate::core::{
    agent_runtime::TerminalAgent,
    error::AppError,
    skill_store::SkillStore,
    terminal::{self, TerminalEvent, TerminalManager, TerminalSession, TerminalSize, TerminalSpec},
};
use std::sync::Arc;
use tauri::{ipc::Channel, Manager, State, Webview};

pub(crate) fn owner<R: tauri::Runtime>(window: &Webview<R>) -> Result<String, AppError> {
    if window.label() != "main" {
        return Err(AppError::invalid_input(
            "Terminal access requires the main window",
        ));
    }
    Ok(window.label().into())
}
#[derive(serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TerminalLaunch {
    Agent {
        agent: TerminalAgent,
    },
    NativeAgent {
        agent: TerminalAgent,
        prompt: String,
    },
    Script {
        path: String,
    },
    Development {
        launch: crate::core::preview::development::DevelopmentLaunch,
    },
}

#[tauri::command]
pub async fn terminal_create(
    window: Webview,
    manager: State<'_, Arc<TerminalManager>>,
    project_id: String,
    worktree_path: Option<String>,
    launch: Option<TerminalLaunch>,
    size: TerminalSize,
    events: Channel<TerminalEvent>,
) -> Result<TerminalSession, AppError> {
    let owner = owner(&window)?;
    let store = window.state::<Arc<SkillStore>>().inner().clone();
    let manager = manager.inner().clone();
    #[cfg(feature = "herdr")]
    let tools = window
        .state::<Arc<crate::core::herdr::tools::HerdrTools>>()
        .inner()
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(feature = "herdr")]
        let mut startup = None;
        let output = events.clone();
        let native_agent = matches!(&launch, Some(TerminalLaunch::NativeAgent { .. }));
        let session = manager
            .create_with(
                &owner,
                || {
                    size.validate()?;
                    let mut cwd = crate::core::project_worktrees::directory(
                        &store,
                        &project_id,
                        worktree_path.as_deref(),
                    )?;
                    let (command, integration) = match launch {
                        Some(TerminalLaunch::NativeAgent { agent, prompt }) => {
                            let prepared = crate::core::agent_launcher::prepare_native_task(
                                &cwd,
                                agent,
                                Some(&prompt),
                            )?;
                            match prepared {
                                crate::core::agent_launcher::Prepared::Terminal(command) => {
                                    (command, None)
                                }
                                #[cfg(feature = "herdr")]
                                crate::core::agent_launcher::Prepared::Herdr(_) => unreachable!(),
                            }
                        }
                        Some(TerminalLaunch::Development { launch }) => {
                            let (directory, command) =
                                crate::core::preview::development::command(&cwd, &launch)?;
                            cwd = directory;
                            (command, None)
                        }
                        Some(TerminalLaunch::Script { path }) => {
                            (terminal::prepare_script(&cwd, &path)?, None)
                        }
                        Some(TerminalLaunch::Agent { agent }) => {
                            #[cfg(feature = "herdr")]
                            let prepared =
                                crate::core::agent_launcher::prepare(&tools, &cwd, agent)?;
                            #[cfg(not(feature = "herdr"))]
                            let prepared =
                                crate::core::agent_launcher::prepare_native(&cwd, agent)?;
                            match prepared {
                                #[cfg(feature = "herdr")]
                                crate::core::agent_launcher::Prepared::Herdr(prepared) => {
                                    startup = Some(prepared.startup);
                                    (prepared.attachment.command(), None)
                                }
                                crate::core::agent_launcher::Prepared::Terminal(command) => {
                                    (command, None)
                                }
                            }
                        }
                        None => {
                            let (command, integration) = terminal::prepare_shell(None, None)?;
                            (command, Some(integration))
                        }
                    };
                    Ok(TerminalSpec {
                        project_id,
                        cwd,
                        command,
                        integration,
                        size,
                    })
                },
                move |event| output.send(event).is_ok(),
            )
            .map_err(AppError::io)?;
        if native_agent {
            manager
                .mark_native_agent(&owner, &session.id)
                .map_err(AppError::io)?;
        }
        #[cfg(feature = "herdr")]
        if let Some(startup) = startup {
            std::thread::spawn(move || {
                if let Err(error) = startup.start() {
                    let _ = events.send(TerminalEvent::Error {
                        message: error.to_string(),
                    });
                }
            });
        }
        Ok(session)
    })
    .await?
}
#[tauri::command]
pub async fn terminal_agent_prompt(
    window: Webview,
    manager: State<'_, Arc<TerminalManager>>,
    id: String,
    prompt: String,
) -> Result<(), AppError> {
    let owner = owner(&window)?;
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        manager
            .agent_prompt(&owner, &id, &prompt)
            .map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn terminal_write(
    window: Webview,
    manager: State<'_, Arc<TerminalManager>>,
    id: String,
    data: String,
) -> Result<(), AppError> {
    let owner = owner(&window)?;
    let manager = manager.inner().clone();
    // Input backpressure must never block the async IPC executor.
    tauri::async_runtime::spawn_blocking(move || {
        manager
            .write(&owner, &id, data.into_bytes())
            .map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn terminal_resize(
    window: Webview,
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
    window: Webview,
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
    window: Webview,
    manager: State<'_, Arc<TerminalManager>>,
    id: String,
) -> Result<(), AppError> {
    let owner = owner(&window)?;
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.close(&owner, &id).map_err(AppError::io))
        .await?
}
#[tauri::command]
pub fn terminal_list<R: tauri::Runtime>(
    window: Webview<R>,
    manager: State<'_, Arc<TerminalManager>>,
) -> Result<Vec<TerminalSession>, AppError> {
    manager.list(&owner(&window)?).map_err(AppError::io)
}

#[tauri::command]
pub fn terminal_launch_state(
    window: Webview,
    manager: State<'_, Arc<TerminalManager>>,
    id: String,
) -> Result<terminal::LaunchState, AppError> {
    manager
        .launch_state(&owner(&window)?, &id)
        .map_err(AppError::io)
}
#[tauri::command]
pub async fn terminal_project_directory(
    window: Webview,
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: Option<String>,
) -> Result<String, AppError> {
    owner(&window)?;
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::core::project_worktrees::directory(&store, &project_id, worktree_path.as_deref())
            .map(|path| path.to_string_lossy().into_owned())
            .map_err(AppError::io)
    })
    .await?
}
