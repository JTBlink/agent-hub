use crate::core::{
    automation::{self, AutomationDraft, AutomationOverview},
    error::AppError,
};

#[tauri::command]
pub async fn preview_automation_package(
    path: String,
) -> Result<automation::package::AutomationPackage, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        automation::package::preview_package(std::path::Path::new(&path))
            .map_err(AppError::invalid_input)
    })
    .await?
}

#[tauri::command]
pub async fn import_automation_package(
    package: automation::package::AutomationPackage,
    workdir: Option<String>,
) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        automation::package::import_definition(package, workdir).map_err(AppError::invalid_input)
    })
    .await?
}

#[tauri::command]
pub async fn export_automation_package(id: String, path: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        automation::package::export_package(&id, std::path::Path::new(&path))
            .map_err(AppError::invalid_input)
    })
    .await?
}

#[tauri::command]
pub async fn set_automation_installation(id: String, installed: bool) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        if installed {
            automation::package::install(&id)
        } else {
            automation::package::uninstall(&id)
        }
        .map_err(AppError::invalid_input)
    })
    .await?
}

#[tauri::command]
pub async fn migrate_automation_package(id: String) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        automation::package::migrate(&id).map_err(AppError::invalid_input)
    })
    .await?
}

#[tauri::command]
pub async fn get_automation_overview(
    locale: Option<String>,
) -> Result<AutomationOverview, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let script_error = automation::sync_workspace_scripts().err();
        let mut report = automation::overview(locale.as_deref());
        if let Some(error) = script_error {
            report.issues.push(automation::SourceIssue {
                source: "agent_hub".into(),
                message: format!("Cannot synchronize automation scripts: {error}"),
            });
        }
        report
    })
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub async fn save_automation(
    id: Option<String>,
    revision: Option<u64>,
    draft: AutomationDraft,
    install: Option<bool>,
) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        if install == Some(false) {
            if id.is_some() {
                return Err(AppError::invalid_input(
                    "Use uninstall to change an existing installation",
                ));
            }
            return automation::package::create_uninstalled(draft).map_err(AppError::invalid_input);
        }
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
pub async fn remove_automation(
    id: String,
    delete_local_data: Option<bool>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        automation::remove_with_local_data(&id, delete_local_data.unwrap_or(false))
            .map_err(AppError::invalid_input)
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
