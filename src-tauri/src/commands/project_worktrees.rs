use crate::core::{
    error::AppError,
    project_worktrees::{self, ProjectWorktree, WorktreeFileEntry},
    skill_store::SkillStore,
};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn get_project_worktrees(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
) -> Result<Vec<ProjectWorktree>, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        project_worktrees::list(&store, &project_id).map_err(AppError::io)
    })
    .await?
}

#[tauri::command]
pub async fn get_worktree_files(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: String,
    relative_path: String,
) -> Result<Vec<WorktreeFileEntry>, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let directory = project_worktrees::directory(&store, &project_id, Some(&worktree_path))
            .map_err(AppError::io)?;
        project_worktrees::entries(&directory, &relative_path).map_err(AppError::io)
    })
    .await?
}

#[tauri::command]
pub async fn read_worktree_file(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: String,
    relative_path: String,
) -> Result<String, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let directory = project_worktrees::directory(&store, &project_id, Some(&worktree_path))
            .map_err(AppError::io)?;
        project_worktrees::read_file(&directory, &relative_path).map_err(AppError::io)
    })
    .await?
}

#[tauri::command]
pub async fn write_worktree_file(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: String,
    relative_path: String,
    expected_content: String,
    content: String,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let directory = project_worktrees::directory(&store, &project_id, Some(&worktree_path))
            .map_err(AppError::io)?;
        crate::core::project_file_edit::save(
            &directory,
            &relative_path,
            &expected_content,
            &content,
        )
        .map_err(AppError::io)
    })
    .await?
}
