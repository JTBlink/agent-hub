//! Workspace windows reuse the normal app and metadata-only project registration.
use crate::{core::error::AppError, desktop::workspaces};

#[derive(serde::Serialize)]
pub struct WorkspaceProject {
    project: super::projects::ProjectDto,
    directory: String,
    visits: Vec<(String, Option<i64>)>,
}

#[tauri::command]
pub async fn resolve_workspace_project(
    app: tauri::AppHandle,
    store: tauri::State<'_, std::sync::Arc<crate::core::skill_store::SkillStore>>,
    path: String,
) -> Result<WorkspaceProject, AppError> {
    let store = store.inner().clone();
    let opened =
        tauri::async_runtime::spawn_blocking(move || -> Result<WorkspaceProject, AppError> {
            let directory = std::path::Path::new(&path)
                .canonicalize()
                .map_err(AppError::io)?;
            let id = crate::core::workspace_registration::resolve_project(&store, &directory)
                .map_err(AppError::io)?;
            store.touch_project_visited(&id).map_err(AppError::db)?;
            let project = store
                .get_project_by_id(&id)
                .map_err(AppError::db)?
                .ok_or_else(|| AppError::invalid_input("Project is no longer registered"))?;
            Ok(WorkspaceProject {
                project: super::projects::project_metadata(&project),
                directory: directory.to_string_lossy().into(),
                visits: store.project_visit_history().map_err(AppError::db)?,
            })
        })
        .await??;
    tauri::Emitter::emit(&app, "project-visits-changed", &opened.visits).map_err(AppError::io)?;
    Ok(opened)
}

#[tauri::command]
pub async fn open_workspace_window(
    app: tauri::AppHandle,
    path: String,
) -> Result<String, AppError> {
    workspaces::open(app, path).await
}
#[tauri::command]
pub fn workspace_window_count(app: tauri::AppHandle) -> usize {
    workspaces::count(&app)
}
#[tauri::command]
pub fn close_workspace_window(webview: tauri::Webview) -> Result<(), AppError> {
    workspaces::close(webview)
}
#[tauri::command]
pub fn workspace_quit_reply(
    webview: tauri::Webview,
    token: String,
    ready: bool,
) -> Result<(), AppError> {
    workspaces::quit_reply(webview, token, ready)
}
