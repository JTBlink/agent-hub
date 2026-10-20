use crate::core::{error::AppError, git_catalog, git_fetcher, skill_store::SkillStore};
use std::{path::PathBuf, sync::Arc};
use tauri::State;

#[tauri::command]
pub async fn preview_local_git_repository(
    path: String,
) -> Result<git_catalog::LocalGitCatalog, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        git_catalog::scan_local_repository(&PathBuf::from(path)).map_err(AppError::git)
    })
    .await?
}

#[tauri::command]
pub async fn install_local_git_skill(
    path: String,
    repo_path: String,
    name: String,
    overwrite_skill_id: Option<String>,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    let skill = tauri::async_runtime::spawn_blocking(move || {
        git_catalog::resolve_local_skill(&PathBuf::from(path), &repo_path).map_err(AppError::git)
    })
    .await??;
    if let Some(skill_id) = overwrite_skill_id {
        let store = store.inner().clone();
        tauri::async_runtime::spawn_blocking(move || {
            super::skills::repository_install::overwrite_local_skill(&store, &skill_id, &skill)
        })
        .await?
    } else {
        super::skills::install_local(skill.to_string_lossy().to_string(), Some(name), None, store)
            .await
    }
}

#[tauri::command]
pub async fn clear_git_repository_cache(repo_url: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        git_fetcher::clear_repository_cache(&repo_url).map_err(AppError::git)
    })
    .await?
}
