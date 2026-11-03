use crate::core::{
    error::AppError,
    system_permissions::{self, Permission, Status},
};
#[tauri::command]
pub async fn get_system_permissions() -> Result<Status, AppError> {
    Ok(tauri::async_runtime::spawn_blocking(system_permissions::status).await?)
}
#[tauri::command]
pub async fn open_system_permission_settings(permission: Permission) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        system_permissions::open_settings(permission).map_err(AppError::io)
    })
    .await?
}
