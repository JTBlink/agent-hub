use crate::core::{
    error::AppError,
    herdr_tools::{HerdrInstallation, HerdrTools, HerdrUpdate},
    skill_store::SkillStore,
};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn herdr_detect(
    tools: State<'_, Arc<HerdrTools>>,
) -> Result<Option<HerdrInstallation>, AppError> {
    let tools = tools.inner().clone();
    tauri::async_runtime::spawn_blocking(move || tools.detect().map_err(AppError::io)).await?
}
#[tauri::command]
pub async fn herdr_install(
    tools: State<'_, Arc<HerdrTools>>,
    store: State<'_, Arc<SkillStore>>,
) -> Result<HerdrInstallation, AppError> {
    let tools = tools.inner().clone();
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        tools
            .install(store.proxy_url().as_deref())
            .map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn herdr_check_update(
    tools: State<'_, Arc<HerdrTools>>,
    store: State<'_, Arc<SkillStore>>,
) -> Result<HerdrUpdate, AppError> {
    let tools = tools.inner().clone();
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        tools
            .check_update(store.proxy_url().as_deref())
            .map_err(AppError::network)
    })
    .await?
}
#[tauri::command]
pub async fn herdr_update(
    tools: State<'_, Arc<HerdrTools>>,
    store: State<'_, Arc<SkillStore>>,
) -> Result<HerdrInstallation, AppError> {
    let tools = tools.inner().clone();
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        tools
            .update(store.proxy_url().as_deref())
            .map_err(AppError::io)
    })
    .await?
}
