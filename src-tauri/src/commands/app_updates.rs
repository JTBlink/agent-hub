//! Thin desktop adapter for the application's own stable release check.

use std::sync::Arc;
use tauri::State;

use crate::core::{app_updates, error::AppError, skill_store::SkillStore};

#[tauri::command]
pub async fn check_app_update(
    app: tauri::AppHandle,
    store: State<'_, Arc<SkillStore>>,
) -> Result<app_updates::AppUpdateInfo, AppError> {
    let version = app.package_info().version.to_string();
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        app_updates::check_update(&version, store.proxy_url().as_deref())
    })
    .await?
}
