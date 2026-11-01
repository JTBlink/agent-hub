use crate::core::{
    error::AppError,
    system_load::{SystemLoad, SystemLoadSnapshot},
};
use std::sync::{Arc, Mutex};
use tauri::State;

#[tauri::command]
pub async fn get_system_load(
    monitor: State<'_, Arc<Mutex<SystemLoad>>>,
) -> Result<SystemLoadSnapshot, AppError> {
    let monitor = monitor.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut monitor = monitor
            .lock()
            .map_err(|_| AppError::internal("System load monitor lock unavailable"))?;
        Ok(monitor.sample())
    })
    .await?
}
