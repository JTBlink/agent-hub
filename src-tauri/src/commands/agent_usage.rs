use crate::core::{
    agent_usage::{AgentUsage, ProviderUsage},
    skill_store::SkillStore,
};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn get_agent_usage(
    usage: State<'_, Arc<AgentUsage>>,
    store: State<'_, Arc<SkillStore>>,
    refresh: Option<bool>,
) -> Result<Vec<ProviderUsage>, crate::core::error::AppError> {
    let store = store.inner().clone();
    let proxy = tauri::async_runtime::spawn_blocking(move || store.proxy_url()).await?;
    Ok(usage.query(refresh.unwrap_or(false), proxy).await)
}

#[tauri::command]
pub async fn consume_codex_reset_credit(
    usage: State<'_, Arc<AgentUsage>>,
    store: State<'_, Arc<SkillStore>>,
    idempotency_key: String,
    credit_id: Option<String>,
) -> Result<crate::core::agent_usage::ResetResult, crate::core::agent_usage::UsageStatus> {
    let store = store.inner().clone();
    let proxy = tauri::async_runtime::spawn_blocking(move || store.proxy_url())
        .await
        .map_err(|_| crate::core::agent_usage::UsageStatus::QueryFailed)?;
    usage.consume_reset(idempotency_key, credit_id, proxy).await
}
