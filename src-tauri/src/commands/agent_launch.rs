use crate::core::{agent_launch_config as config, error::AppError};

#[tauri::command]
pub async fn agent_launch_settings() -> Result<config::Snapshot, AppError> {
    tauri::async_runtime::spawn_blocking(|| config::load().map_err(AppError::io)).await?
}
#[tauri::command]
pub async fn save_agent_launch_settings(
    document: config::Document,
    revision: String,
) -> Result<config::Snapshot, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        config::save(document, &revision).map_err(AppError::io)
    })
    .await?
}

#[derive(serde::Serialize)]
pub struct NativeLaunchOutcome {
    pub receipt: crate::core::agent_launcher::external_terminal::Receipt,
    pub warning: Option<String>,
}
/// Return None when Herdr is installed. Never fall back after a submitted Herdr request.
#[tauri::command]
pub async fn task_native_agent_launch(
    store: tauri::State<'_, std::sync::Arc<crate::core::skill_store::SkillStore>>,
    tools: tauri::State<'_, std::sync::Arc<crate::core::herdr::tools::HerdrTools>>,
    project_id: String,
    path: String,
    kind: String,
    prompt: String,
) -> Result<Option<NativeLaunchOutcome>, AppError> {
    let store = store.inner().clone();
    let tools = tools.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if tools.detect().map_err(AppError::io)?.is_some() { return Ok(None); }
        let cwd = crate::core::project_worktrees::directory(&store, &project_id, Some(&path)).map_err(AppError::io)?;
        let launch = config::resolve(&kind).map_err(AppError::io)?;
        let mut submitted = None;
        let opened = crate::core::agent_launcher::external_terminal::open(&launch, &cwd, Some(&prompt), |receipt| { submitted = Some(receipt.clone()); Ok(()) });
        match (opened, submitted) {
            (Ok(receipt), _) => Ok(Some(NativeLaunchOutcome { receipt, warning: None })),
            (Err(error), Some(receipt)) => Ok(Some(NativeLaunchOutcome { receipt, warning: Some(format!("{error}; terminal launch was submitted. Inspect the native terminal before retrying")) })),
            (Err(error), None) => Err(AppError::io(error)),
        }
    }).await?
}
