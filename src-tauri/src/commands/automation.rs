use crate::core::{
    automation::{self, AutomationDraft, AutomationOverview},
    error::AppError,
};

#[tauri::command]
pub async fn get_automation_overview(
    locale: Option<String>,
) -> Result<AutomationOverview, AppError> {
    tauri::async_runtime::spawn_blocking(move || automation::overview(locale.as_deref()))
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn save_automation(
    id: Option<String>,
    revision: Option<u64>,
    draft: AutomationDraft,
) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        automation::save(id.as_deref(), revision, draft).map_err(AppError::invalid_input)
    })
    .await?
}

#[tauri::command]
pub async fn run_automation(id: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        automation::run(&id).map_err(AppError::invalid_input)
    })
    .await?
}

#[tauri::command]
pub async fn remove_automation(id: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        automation::remove(&id).map_err(AppError::invalid_input)
    })
    .await?
}

#[tauri::command]
pub async fn get_automation_backups() -> Result<Vec<automation::AutomationBackup>, AppError> {
    tauri::async_runtime::spawn_blocking(|| {
        automation::backup::list().map_err(AppError::invalid_input)
    })
    .await?
}

#[tauri::command]
pub async fn get_automation_templates(
    locale: Option<String>,
) -> Result<automation::AutomationCatalog, AppError> {
    tauri::async_runtime::spawn_blocking(move || automation::templates(locale.as_deref()))
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn get_automation_output(
    id: String,
    run_id: Option<String>,
) -> Result<automation::AutomationRunOutput, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        match run_id {
            Some(run) => automation::run_output(&id, &run),
            None => automation::output(&id),
        }
        .map_err(AppError::invalid_input)
    })
    .await?
}

#[tauri::command]
pub async fn get_automation_history(id: String) -> Result<automation::AutomationHistory, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        automation::history(&id).map_err(AppError::invalid_input)
    })
    .await?
}
