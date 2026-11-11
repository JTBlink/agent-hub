use crate::core::{
    error::AppError,
    project_worktrees::{self, ProjectWorktree, WorktreeFileEntry},
    skill_store::SkillStore,
};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn paste_worktree_files(
    app: tauri::AppHandle,
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: String,
    relative_path: String,
) -> Result<Vec<String>, AppError> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        crate::core::clipboard::files::request_files(move |result| {
            let _ = sender.send(result);
        });
    })?;
    let sources = tokio::time::timeout(std::time::Duration::from_secs(10), receiver)
        .await
        .map_err(AppError::io)?
        .map_err(AppError::io)?
        .map_err(AppError::io)?;
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_worktrees::directory(&store, &project_id, Some(&worktree_path))
            .map_err(AppError::io)?;
        crate::core::project_file_actions::paste::copy_into(&root, &relative_path, &sources)
            .map_err(AppError::io)
    })
    .await?
}

#[tauri::command]
pub async fn modify_worktree_entry(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: String,
    relative_path: String,
    action: crate::core::project_file_actions::FileAction,
) -> Result<String, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_worktrees::directory(&store, &project_id, Some(&worktree_path))
            .map_err(AppError::io)?;
        crate::core::project_file_actions::apply(&root, &relative_path, action)
            .map_err(AppError::io)
    })
    .await?
}

#[tauri::command]
pub async fn reveal_worktree_entry(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: String,
    relative_path: String,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_worktrees::directory(&store, &project_id, Some(&worktree_path))
            .map_err(AppError::io)?;
        let path = crate::core::project_file_actions::existing_path(&root, &relative_path)
            .map_err(AppError::io)?;
        tauri_plugin_opener::reveal_item_in_dir(path).map_err(AppError::io)
    })
    .await?
}

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

#[tauri::command]
pub async fn search_worktree(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: String,
    options: crate::core::worktree_search::SearchOptions,
) -> Result<crate::core::worktree_search::SearchResult, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let directory = project_worktrees::directory(&store, &project_id, Some(&worktree_path))
            .map_err(AppError::io)?;
        crate::core::worktree_search::search(&directory, &options).map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn replace_worktree_matches(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    worktree_path: String,
    options: crate::core::worktree_search::SearchOptions,
    replacement: String,
    files: Vec<crate::core::worktree_search::SearchFile>,
) -> Result<crate::core::worktree_search::ReplaceResult, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let directory = project_worktrees::directory(&store, &project_id, Some(&worktree_path))
            .map_err(AppError::io)?;
        crate::core::worktree_search::replace(&directory, &options, &replacement, &files)
            .map_err(AppError::io)
    })
    .await?
}

#[tauri::command]
pub async fn create_project_worktree(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    source_path: String,
    branch: String,
    destination: String,
) -> Result<ProjectWorktree, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        project_worktrees::create(&store, &project_id, &source_path, &branch, &destination)
            .map_err(AppError::io)
    })
    .await?
}
