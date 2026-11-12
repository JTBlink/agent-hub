use crate::core::{
    automation::{self, AutomationDraft, AutomationOverview},
    error::AppError,
};

#[tauri::command]
pub async fn open_automation_workspace(app: tauri::AppHandle) -> Result<String, AppError> {
    let directory = tauri::async_runtime::spawn_blocking(|| {
        automation::open_workspace_root().map_err(AppError::invalid_input)
    })
    .await??;
    crate::desktop::workspaces::open(app, directory.to_string_lossy().into()).await
}

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
    // Script reconciliation belongs to the change watcher and explicit writes.
    // Opening a view must not acquire the mutation lock or wait for synchronization.
    tauri::async_runtime::spawn_blocking(move || automation::overview(locale.as_deref()))
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn get_automation_copy_draft(
    id: String,
    revision: Option<u64>,
) -> Result<AutomationDraft, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        automation::copy_draft(&id, revision).map_err(AppError::invalid_input)
    })
    .await?
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

#[tauri::command]
pub async fn preview_git_automation_packages(
    store: tauri::State<'_, std::sync::Arc<crate::core::skill_store::SkillStore>>,
    url: String,
    reference: Option<String>,
) -> Result<automation::package::catalog::GitAutomationCatalog, AppError> {
    let proxy = store.proxy_url();
    tauri::async_runtime::spawn_blocking(move || {
        automation::package::catalog::preview_git(&url, reference.as_deref(), proxy.as_deref())
            .map_err(AppError::invalid_input)
    })
    .await?
}

#[tauri::command]
pub async fn run_automation_action(
    id: String,
    action_id: String,
    revision: u64,
    preview: bool,
    token: Option<String>,
) -> Result<automation::AutomationActionResult, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        automation::run_action(&id, &action_id, revision, preview, token.as_deref())
            .map_err(AppError::invalid_input)
    })
    .await?
}
