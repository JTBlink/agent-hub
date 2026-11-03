use crate::core::{error::AppError, hosts};

#[tauri::command]
pub async fn open_hosts_permission_settings() -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(|| {
        hosts::permissions::open_settings().map_err(AppError::io)
    })
    .await?
}

#[tauri::command]
pub async fn read_system_hosts() -> Result<hosts::HostsSnapshot, AppError> {
    tauri::async_runtime::spawn_blocking(|| hosts::read_for_editor().map_err(AppError::io)).await?
}

#[tauri::command]
pub async fn save_system_hosts(
    content: String,
    revision: String,
) -> Result<hosts::HostsSaved, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        hosts::save(&content, &revision).map_err(AppError::io)
    })
    .await?
}

#[tauri::command]
pub async fn list_hosts_profiles() -> Result<Vec<hosts::profiles::HostsProfile>, AppError> {
    tauri::async_runtime::spawn_blocking(|| hosts::profiles::list().map_err(AppError::io)).await?
}
#[tauri::command]
pub async fn create_hosts_profile(
    name: String,
    content: String,
) -> Result<hosts::profiles::HostsProfile, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        hosts::profiles::create(&name, &content).map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn update_hosts_profile(
    id: String,
    name: String,
    content: String,
    revision: String,
) -> Result<hosts::profiles::HostsProfile, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        hosts::profiles::update(&id, &name, &content, &revision).map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn delete_hosts_profile(id: String, revision: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        hosts::profiles::delete(&id, &revision).map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn apply_hosts_profile(
    id: String,
    profile_revision: String,
    system_revision: String,
) -> Result<hosts::HostsSaved, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        hosts::profiles::apply(&id, &profile_revision, &system_revision).map_err(AppError::io)
    })
    .await?
}
