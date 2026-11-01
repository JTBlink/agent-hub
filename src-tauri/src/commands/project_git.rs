use crate::core::{
    error::AppError,
    project_git::{self, GitStatus},
    project_worktrees,
    skill_store::SkillStore,
};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn get_project_git_status(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: Option<String>,
) -> Result<GitStatus, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_worktrees::directory(&store, &project_id, worktree_path.as_deref())
            .map_err(AppError::io)?;
        project_git::status(&root).map_err(AppError::io)
    })
    .await?
}

#[tauri::command]
pub async fn get_project_git_diff(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: Option<String>,
    path: String,
    staged: bool,
) -> Result<String, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_worktrees::directory(&store, &project_id, worktree_path.as_deref())
            .map_err(AppError::io)?;
        project_git::diff(&root, &path, staged).map_err(AppError::io)
    })
    .await?
}

#[tauri::command]
pub async fn set_project_git_staged(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: Option<String>,
    paths: Vec<String>,
    staged: bool,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_worktrees::directory(&store, &project_id, worktree_path.as_deref())
            .map_err(AppError::io)?;
        project_git::set_staged(&root, &paths, staged).map_err(AppError::io)
    })
    .await?
}

#[tauri::command]
pub async fn commit_project_git(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: Option<String>,
    message: String,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_worktrees::directory(&store, &project_id, worktree_path.as_deref())
            .map_err(AppError::io)?;
        project_git::commit(&root, &message).map_err(AppError::io)
    })
    .await?
}
