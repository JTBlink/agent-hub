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
    tauri::async_runtime::spawn_blocking(|| hosts::read().map_err(AppError::io)).await?
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
