//! Trusted instances of the same application; preview webviews never enter this registry.

use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

use crate::core::{error::AppError, skill_store::SkillStore, terminal::TerminalManager};

#[derive(Default)]
pub(crate) struct WorkspaceWindows {
    labels: Mutex<HashSet<String>>,
    quit: Mutex<Option<QuitRequest>>,
}
struct QuitRequest {
    token: String,
    waiting: HashSet<String>,
}

pub(crate) fn is_workspace<R: tauri::Runtime>(view: &tauri::Webview<R>) -> bool {
    view.label() == "main"
        || view
            .try_state::<WorkspaceWindows>()
            .is_some_and(|state| state.contains(view.label()))
}
impl WorkspaceWindows {
    fn contains(&self, label: &str) -> bool {
        self.labels
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .contains(label)
    }
    fn remove(&self, label: &str) {
        self.labels
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(label);
    }
}

fn same_application_origin(application: &tauri::Url, target: &tauri::Url) -> bool {
    // Custom Tauri schemes have opaque URL origins; compare the local authority explicitly.
    application.scheme() == target.scheme()
        && application.host_str() == target.host_str()
        && application.port_or_known_default() == target.port_or_known_default()
}

pub(crate) fn count(app: &tauri::AppHandle) -> usize {
    app.state::<WorkspaceWindows>()
        .labels
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .len()
        + 1
}

pub(crate) async fn open(app: tauri::AppHandle, path: String) -> Result<String, AppError> {
    let store = app.state::<Arc<SkillStore>>().inner().clone();
    let (project, directory, visits) = tauri::async_runtime::spawn_blocking(move || {
        let directory = std::path::PathBuf::from(path)
            .canonicalize()
            .map_err(AppError::io)?;
        if !directory.is_dir() {
            return Err(AppError::invalid_input("Workspace must be a directory"));
        }
        let project = crate::core::workspace_registration::resolve_project(&store, &directory)
            .map_err(AppError::io)?;
        store
            .touch_project_visited(&project)
            .map_err(AppError::db)?;
        let visits = store.project_visit_history().map_err(AppError::db)?;
        Ok((project, directory, visits))
    })
    .await
    .map_err(AppError::io)??;
    app.emit("project-visits-changed", visits)
        .map_err(AppError::io)?;
    // Stable identity restores this folder's layout and focuses an already open window.
    use sha2::{Digest, Sha256};
    let label = format!(
        "workspace-{}",
        hex::encode(Sha256::digest(directory.to_string_lossy().as_bytes()))
    );
    let result_label = label.clone();
    let (send, receive) = tokio::sync::oneshot::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let result = open_on_main(&handle, &label, &project, &directory);
        let _ = send.send(result);
    })
    .map_err(AppError::io)?;
    receive.await.map_err(AppError::io)??;
    Ok(result_label)
}

fn open_on_main(
    app: &tauri::AppHandle,
    label: &str,
    project: &str,
    directory: &std::path::Path,
) -> Result<(), AppError> {
    let state = app.state::<WorkspaceWindows>();
    if state
        .quit
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .is_some()
    {
        return Err(AppError::invalid_input("Application exit is pending"));
    }
    if let Some(window) = app.get_webview_window(label) {
        window.show().map_err(AppError::io)?;
        window.unminimize().map_err(AppError::io)?;
        window
            .emit_to(
                tauri::EventTarget::window(label),
                "workspace-open-directory",
                serde_json::json!({ "projectId": project, "path": directory.to_string_lossy() }),
            )
            .map_err(AppError::io)?;
        return window.set_focus().map_err(AppError::io);
    }
    let url = std::path::PathBuf::from(format!(
        "project/{project}?worktree={}",
        urlencoding::encode(&directory.to_string_lossy())
    ));
    let application_url = app
        .get_webview("main")
        .ok_or_else(|| AppError::not_found("Main workspace unavailable"))?
        .url()
        .map_err(AppError::io)?;
    app.state::<Arc<TerminalManager>>().open_owner(label);
    state
        .labels
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(label.into());
    let mut config = app
        .config()
        .app
        .windows
        .first()
        .cloned()
        .unwrap_or_default();
    config.label = label.into();
    config.url = tauri::WebviewUrl::App(url);
    config.title = format!(
        "{} · {}",
        directory.file_name().unwrap_or_default().to_string_lossy(),
        config.title
    );
    config.maximized = false;
    config.width = 1280.0;
    config.height = 800.0;
    let builder = match tauri::WebviewWindowBuilder::from_config(app, &config) {
        Ok(builder) => {
            builder.on_navigation(move |url| same_application_origin(&application_url, url))
        }
        Err(error) => {
            state.remove(label);
            return Err(AppError::io(error));
        }
    };
    let window = match builder.build() {
        Ok(window) => window,
        Err(error) => {
            state.remove(label);
            return Err(AppError::io(error));
        }
    };
    // Dynamically created overlay windows on macOS may retain an empty WebView
    // frame until their first resize. Apply the client bounds before first use.
    let view: &tauri::Webview = window.as_ref();
    if let Ok(size) = window.inner_size() {
        let _ = view.set_size(size);
    }
    let event_window = window.clone();
    let owner = label.to_owned();
    window.on_window_event(move |event| match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            if !super::lifecycle::QUITTING.load(std::sync::atomic::Ordering::SeqCst) {
                api.prevent_close();
                let _ = event_window.emit_to(
                    tauri::EventTarget::window(event_window.label()),
                    "window-close-requested",
                    (),
                );
            }
        }
        tauri::WindowEvent::Destroyed => {
            let app = event_window.app_handle();
            let state = app.state::<WorkspaceWindows>();
            state.remove(&owner);
            if let Some(request) = state.quit.lock().unwrap_or_else(|e| e.into_inner()).take() {
                let _ = app.emit("workspace-quit-cancelled", request.token);
            }
            let cleanup = app.state::<Arc<TerminalManager>>().detach_owner(&owner);
            tauri::async_runtime::spawn_blocking(cleanup);
            if state
                .labels
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .is_empty()
                && !super::lifecycle::QUITTING.load(std::sync::atomic::Ordering::SeqCst)
            {
                if let Some(main) = app
                    .get_window("main")
                    .filter(|main| !main.is_visible().unwrap_or(true))
                {
                    let _ = main.show();
                    let _ = main.set_focus();
                }
            }
        }
        _ => {}
    });
    let _ = app.emit("app-files-changed", ());
    Ok(())
}

pub(crate) fn close(view: tauri::Webview) -> Result<(), AppError> {
    if view.label() == "main" {
        if count(view.app_handle()) > 1 {
            return view.window().hide().map_err(AppError::io);
        }
        return request_quit(view.app_handle());
    }
    view.window().destroy().map_err(AppError::io)
}

/// No window is destroyed until every workspace has dealt with its unsaved files.
pub(crate) fn request_quit(app: &tauri::AppHandle) -> Result<(), AppError> {
    let state = app.state::<WorkspaceWindows>();
    let token = uuid::Uuid::new_v4().to_string();
    let mut waiting = state
        .labels
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    waiting.insert("main".into());
    {
        let mut quit = state.quit.lock().unwrap_or_else(|e| e.into_inner());
        if quit.is_some() {
            return Ok(());
        }
        *quit = Some(QuitRequest {
            token: token.clone(),
            waiting: waiting.clone(),
        });
    }
    for label in waiting {
        if let Err(error) = app.emit_to(
            tauri::EventTarget::window(label),
            "workspace-quit-check",
            &token,
        ) {
            *state.quit.lock().unwrap_or_else(|e| e.into_inner()) = None;
            let _ = app.emit("workspace-quit-cancelled", &token);
            return Err(AppError::io(error));
        }
    }
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(120)).await;
        let state = handle.state::<WorkspaceWindows>();
        let mut quit = state.quit.lock().unwrap_or_else(|e| e.into_inner());
        if quit.as_ref().is_some_and(|request| request.token == token) {
            *quit = None;
            let _ = handle.emit("workspace-quit-cancelled", token);
        }
    });
    Ok(())
}

pub(crate) fn quit_reply(view: tauri::Webview, token: String, ready: bool) -> Result<(), AppError> {
    let app = view.app_handle();
    let state = app.state::<WorkspaceWindows>();
    let complete = {
        let mut quit = state.quit.lock().unwrap_or_else(|e| e.into_inner());
        let Some(request) = quit.as_mut().filter(|request| request.token == token) else {
            return Ok(());
        };
        if !ready {
            *quit = None;
            false
        } else {
            request.waiting.remove(view.label());
            request.waiting.is_empty()
        }
    };
    if !ready {
        let _ = app.emit("workspace-quit-cancelled", &token);
    }
    if complete {
        let app = app.clone();
        let handle = app.clone();
        app.run_on_main_thread(move || super::lifecycle::quit_app(&handle))
            .map_err(AppError::io)?;
    }
    Ok(())
}

#[cfg(test)]
#[path = "workspaces/tests.rs"]
mod tests;
