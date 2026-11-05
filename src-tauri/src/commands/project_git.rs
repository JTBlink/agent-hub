use crate::core::{
    error::AppError,
    project_git::{self, GitStatus},
    project_worktrees,
    skill_store::SkillStore,
};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn run_project_git_action(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: Option<String>,
    action: project_git::GitRepositoryAction,
    branch: Option<String>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_worktrees::directory(&store, &project_id, worktree_path.as_deref())
            .map_err(AppError::io)?;
        project_git::repository_action(&root, action, branch.as_deref()).map_err(AppError::io)
    })
    .await?
}

#[tauri::command]
pub async fn get_project_git_remotes(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: Option<String>,
) -> Result<Vec<project_git::GitRemote>, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_worktrees::directory(&store, &project_id, worktree_path.as_deref())
            .map_err(AppError::io)?;
        project_git::remotes(&root).map_err(AppError::io)
    })
    .await?
}

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
pub async fn discard_project_git_changes(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: Option<String>,
    paths: Vec<String>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_worktrees::directory(&store, &project_id, worktree_path.as_deref())
            .map_err(AppError::io)?;
        project_git::discard(&root, &paths).map_err(AppError::io)
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

#[tauri::command]
pub async fn get_project_git_commit(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: Option<String>,
    sha: String,
) -> Result<project_git::GitCommitDetails, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_worktrees::directory(&store, &project_id, worktree_path.as_deref())
            .map_err(AppError::io)?;
        project_git::commit_details(&root, &sha).map_err(AppError::io)
    })
    .await?
}

#[tauri::command]
pub async fn get_project_git_commit_diff(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: Option<String>,
    sha: String,
    path: String,
    view: Option<String>,
) -> Result<String, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_worktrees::directory(&store, &project_id, worktree_path.as_deref())
            .map_err(AppError::io)?;
        project_git::commit_file_view(&root, &sha, &path, view.as_deref()).map_err(AppError::io)
    })
    .await?
}

#[tauri::command]
pub async fn get_project_git_references(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: Option<String>,
) -> Result<project_git::GitReferences, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_worktrees::directory(&store, &project_id, worktree_path.as_deref())
            .map_err(AppError::io)?;
        project_git::references(&root).map_err(AppError::io)
    })
    .await?
}

#[tauri::command]
pub async fn get_project_git_history(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: Option<String>,
    sha: String,
    offset: usize,
) -> Result<project_git::GitHistoryPage, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_worktrees::directory(&store, &project_id, worktree_path.as_deref())
            .map_err(AppError::io)?;
        project_git::commit_history(&root, &sha, offset).map_err(AppError::io)
    })
    .await?
}

#[tauri::command]
pub async fn get_project_git_graph(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: Option<String>,
    include_remotes: bool,
    limit: usize,
) -> Result<project_git::GitGraph, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_worktrees::directory(&store, &project_id, worktree_path.as_deref())
            .map_err(AppError::io)?;
        project_git::graph(&root, include_remotes, limit).map_err(AppError::io)
    })
    .await?
}
