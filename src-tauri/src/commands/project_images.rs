use crate::core::{error::AppError, project_images, project_worktrees, skill_store::SkillStore};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn read_project_image(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: Option<String>,
    path: String,
    revision: project_images::ImageRevision,
    sha: Option<String>,
) -> Result<tauri::ipc::Response, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_worktrees::directory(&store, &project_id, worktree_path.as_deref())
            .map_err(AppError::io)?;
        let bytes = project_images::read_image(&root, &path, revision, sha.as_deref())
            .map_err(AppError::io)?;
        // An empty response denotes a missing version; empty image files are errors.
        Ok(tauri::ipc::Response::new(bytes.unwrap_or_default()))
    })
    .await?
}
