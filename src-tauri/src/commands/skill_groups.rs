pub mod membership;
pub use membership::set_skill_group_skills_internal;

use serde::{Deserialize, Serialize};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::Instant;
use tauri::State;

use crate::core::{
    error::AppError,
    scenario_service::{self, BatchApplyMode},
    skill_store::{ScenarioRecord, SkillStore},
    sync_metadata,
    timing::should_log_first_or_slow,
    tool_adapters,
};

fn refresh_tray_menu_best_effort(app: &tauri::AppHandle) {
    if let Err(err) = crate::refresh_tray_menu(app) {
        log::warn!("Failed to refresh tray menu after skill group mutation: {err}");
    }
}

/// Sync a skill's files to all enabled tool adapter directories for the given skill_group.
/// Only performs sync if the skill group is the currently active one.
pub(crate) fn sync_skill_to_active_skill_group(
    store: &SkillStore,
    scenario_id: &str,
    skill_id: &str,
) -> Result<(), AppError> {
    scenario_service::sync_skill_to_active_scenario(store, scenario_id, skill_id)
}

#[derive(Debug, Serialize)]
pub struct SkillGroupDto {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub sort_order: i32,
    pub skill_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

static GET_SKILL_GROUPS_FIRST_CALL: AtomicBool = AtomicBool::new(true);

fn skill_group_dto(store: &SkillStore, scenario: ScenarioRecord) -> SkillGroupDto {
    let skill_count = store.count_skills_for_scenario(&scenario.id).unwrap_or(0);
    SkillGroupDto {
        id: scenario.id,
        name: scenario.name,
        description: scenario.description,
        icon: scenario.icon,
        sort_order: scenario.sort_order,
        skill_count,
        created_at: scenario.created_at,
        updated_at: scenario.updated_at,
    }
}

#[tauri::command]
pub async fn get_skill_groups(
    store: State<'_, Arc<SkillStore>>,
) -> Result<Vec<SkillGroupDto>, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let start = Instant::now();
        let scenarios = store.get_all_scenarios().map_err(AppError::db)?;
        let count = scenarios.len();
        let mut result = Vec::new();
        for s in scenarios {
            result.push(skill_group_dto(&store, s));
        }
        let elapsed_ms = start.elapsed().as_millis();
        if should_log_first_or_slow(&GET_SKILL_GROUPS_FIRST_CALL, elapsed_ms, 100) {
            log::info!("get_skill_groups: {count} skill groups in {elapsed_ms} ms");
        }
        Ok(result)
    })
    .await?
}

#[tauri::command]
pub async fn get_active_skill_group(
    store: State<'_, Arc<SkillStore>>,
) -> Result<Option<SkillGroupDto>, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let active_id = store.get_active_scenario_id().map_err(AppError::db)?;

        if let Some(id) = active_id {
            let scenarios = store.get_all_scenarios().map_err(AppError::db)?;
            if let Some(s) = scenarios.into_iter().find(|s| s.id == id) {
                return Ok(Some(skill_group_dto(&store, s)));
            }
        }
        Ok(None)
    })
    .await?
}

#[tauri::command]
pub async fn create_skill_group(
    app: tauri::AppHandle,
    name: String,
    description: Option<String>,
    icon: Option<String>,
    store: State<'_, Arc<SkillStore>>,
) -> Result<SkillGroupDto, AppError> {
    let store = store.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        create_and_activate_skill_group_internal(
            &store,
            &name,
            description.as_deref(),
            icon.as_deref(),
        )
        .map(|scenario| skill_group_dto(&store, scenario))
    })
    .await?;
    if result.is_ok() {
        refresh_tray_menu_best_effort(&app);
    }
    result
}

pub fn create_skill_group_internal(
    store: &SkillStore,
    name: &str,
    description: Option<&str>,
    icon: Option<&str>,
) -> Result<ScenarioRecord, AppError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::invalid_input("Skill group name cannot be empty"));
    }

    let now = chrono::Utc::now().timestamp_millis();
    let id = uuid::Uuid::new_v4().to_string();
    let record = ScenarioRecord {
        id: id.clone(),
        name: name.to_string(),
        description: description
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        icon: icon
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        sort_order: 999,
        created_at: now,
        updated_at: now,
    };

    sync_metadata::with_repo_lock("create skill group", || {
        store.insert_scenario(&record)?;
        sync_metadata::write_all_from_db_unlocked(store)
    })
    .map_err(AppError::db)?;
    Ok(record)
}

/// Preserve the desktop app's legacy create-and-select behavior while the CLI
/// uses [`create_skill_group_internal`] as a pure organization operation.
fn create_and_activate_skill_group_internal(
    store: &SkillStore,
    name: &str,
    description: Option<&str>,
    icon: Option<&str>,
) -> Result<ScenarioRecord, AppError> {
    let previous_active_id = store.get_active_scenario_id().map_err(AppError::db)?;
    let record = create_skill_group_internal(store, name, description, icon)?;
    if let Some(previous_id) = previous_active_id.as_deref() {
        unsync_scenario_skills(store, previous_id)?;
    }
    store
        .set_active_scenario(&record.id)
        .map_err(AppError::db)?;
    Ok(record)
}

#[tauri::command]
pub async fn update_skill_group(
    app: tauri::AppHandle,
    id: String,
    name: String,
    description: Option<String>,
    icon: Option<String>,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        update_skill_group_internal(&store, &id, &name, description.as_deref(), icon.as_deref())
    })
    .await?;
    if result.is_ok() {
        refresh_tray_menu_best_effort(&app);
    }
    result
}

pub fn update_skill_group_internal(
    store: &SkillStore,
    id: &str,
    name: &str,
    description: Option<&str>,
    icon: Option<&str>,
) -> Result<(), AppError> {
    scenario_service::ensure_scenario_exists(store, id)?;
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::invalid_input("Skill group name cannot be empty"));
    }
    let description = description.map(str::trim).filter(|value| !value.is_empty());
    let icon = icon.map(str::trim).filter(|value| !value.is_empty());
    sync_metadata::with_repo_lock("update skill group", || {
        store.update_scenario(id, name, description, icon)?;
        sync_metadata::write_all_from_db_unlocked(store)
    })
    .map_err(AppError::db)
}

#[tauri::command]
pub async fn delete_skill_group(
    app: tauri::AppHandle,
    id: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        delete_skill_group_with_active_fallback_internal(&store, &id)
    })
    .await?;
    if result.is_ok() {
        refresh_tray_menu_best_effort(&app);
    }
    result
}

pub fn delete_skill_group_internal(store: &SkillStore, id: &str) -> Result<(), AppError> {
    scenario_service::ensure_scenario_exists(store, id)?;
    let was_active = store
        .get_active_scenario_id()
        .map_err(AppError::db)?
        .as_deref()
        == Some(id);

    sync_metadata::with_repo_lock("delete skill group", || {
        if was_active {
            store.clear_active_scenario()?;
        }
        store.delete_scenario(id)?;
        sync_metadata::remove_scenario_metadata(id)
    })
    .map_err(AppError::db)
}

/// Preserve the desktop app's legacy active-skill-group transition. The CLI calls
/// [`delete_skill_group_internal`] directly so deleting an organization object does
/// not implicitly undeploy skills.
fn delete_skill_group_with_active_fallback_internal(
    store: &SkillStore,
    id: &str,
) -> Result<(), AppError> {
    scenario_service::ensure_scenario_exists(store, id)?;
    let was_active = store
        .get_active_scenario_id()
        .map_err(AppError::db)?
        .as_deref()
        == Some(id);

    if was_active {
        unsync_scenario_skills(store, id)?;
    }

    delete_skill_group_internal(store, id)?;

    if was_active {
        let remaining = store.get_all_scenarios().map_err(AppError::db)?;
        if let Some(first) = remaining.first() {
            store.set_active_scenario(&first.id).map_err(AppError::db)?;
            // The skill group is already deleted and the fallback already active, so
            // a refusal here cannot undo any of that — report it, don't fail.
            for refusal in sync_scenario_skills(store, &first.id, false)? {
                log::warn!("fallback skill group sync skipped a target: {refusal}");
            }
        }
    }

    Ok(())
}

/// Apply a skill group to the default targets (all enabled agent globals).
///
/// This is the explicit user-initiated action introduced in v1.16. It performs
/// the same disk-writing work as the legacy [`switch_skill_group`] command but is
/// only invoked when the user clicks "Apply to Default" — sidebar/command-palette
/// skill group clicks no longer call this.
#[tauri::command]
pub async fn apply_skill_group_to_default(
    app: tauri::AppHandle,
    id: String,
    force: Option<bool>,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    apply_skill_group_to_default_impl(app, id, force.unwrap_or(false), store.inner().clone()).await
}

/// Legacy command kept for the CLI and backward compatibility. New callers
/// should use [`apply_skill_group_to_default`] (or [`apply_skill_group_to_coding_agents`]
/// for the workspace-scoped variant the tray now uses).
#[tauri::command]
pub async fn switch_skill_group(
    app: tauri::AppHandle,
    id: String,
    force: Option<bool>,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    apply_skill_group_to_default_impl(app, id, force.unwrap_or(false), store.inner().clone()).await
}

async fn apply_skill_group_to_default_impl(
    app: tauri::AppHandle,
    id: String,
    force: bool,
    store: Arc<SkillStore>,
) -> Result<(), AppError> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        scenario_service::apply_scenario_to_default(&store, &id, force)
    })
    .await?;
    // Refresh even on failure. `apply_scenario_to_default` commits the active
    // skill group before syncing, and syncing now reports ownership refusals as an
    // error (#363) — so an error here still means the skill group switched and most
    // skills deployed. Gating the refresh on success would leave the tray
    // showing the old skill_group while the app is on the new one. Failures that
    // happen before the switch make this a harmless no-op refresh.
    refresh_tray_menu_best_effort(&app);
    result.and_then(scenario_service::refusals_to_error)
}

#[tauri::command]
pub async fn reorder_skill_groups(
    app: tauri::AppHandle,
    ids: Vec<String>,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        sync_metadata::with_repo_lock("reorder scenarios", || {
            store.reorder_scenarios(&ids)?;
            sync_metadata::write_all_from_db_unlocked(&store)
        })
        .map_err(AppError::db)
    })
    .await?;
    if result.is_ok() {
        refresh_tray_menu_best_effort(&app);
    }
    result
}

#[tauri::command]
pub async fn get_skill_group_skill_order(
    skill_group_id: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<Vec<String>, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        store
            .get_skill_ids_for_scenario(&skill_group_id)
            .map_err(AppError::db)
    })
    .await?
}

#[tauri::command]
pub async fn reorder_skill_group_skills(
    skill_group_id: String,
    skill_ids: Vec<String>,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        sync_metadata::with_repo_lock("reorder scenario skills", || {
            store.reorder_scenario_skills(&skill_group_id, &skill_ids)?;
            sync_metadata::write_all_from_db_unlocked(&store)
        })
        .map_err(AppError::db)
    })
    .await?
}

// ── Internal helpers ──

pub(crate) fn sync_scenario_skills(
    store: &SkillStore,
    scenario_id: &str,
    force: bool,
) -> Result<Vec<scenario_service::TargetConflict>, AppError> {
    scenario_service::sync_scenario_skills(store, scenario_id, force)
}

pub(crate) fn unsync_scenario_skills(
    store: &SkillStore,
    scenario_id: &str,
) -> Result<(), AppError> {
    scenario_service::unsync_scenario_skills(store, scenario_id)
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SkillGroupApplyMode {
    Add,
    Remove,
}

impl From<SkillGroupApplyMode> for BatchApplyMode {
    fn from(value: SkillGroupApplyMode) -> Self {
        match value {
            SkillGroupApplyMode::Add => BatchApplyMode::Add,
            SkillGroupApplyMode::Remove => BatchApplyMode::Remove,
        }
    }
}

/// Apply (or remove) every skill in `skill_group_id` against every enabled coding
/// agent (`ToolCategory::Coding`). Mirrors the SkillGroupBar behavior in the
/// global workspace view but covers all enabled coding agents at once.
///
/// Lobster agents are intentionally excluded — they have their own workspace
/// and their own skill group bar.
#[tauri::command]
pub async fn apply_skill_group_to_coding_agents(
    app: tauri::AppHandle,
    skill_group_id: String,
    mode: SkillGroupApplyMode,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        scenario_service::ensure_scenario_exists(&store, &skill_group_id)?;
        let skill_ids = store
            .get_skill_ids_for_scenario(&skill_group_id)
            .map_err(AppError::db)?;
        if skill_ids.is_empty() {
            return Ok(());
        }
        let tool_keys: Vec<String> = tool_adapters::enabled_deployable_adapters(&store)
            .into_iter()
            .filter(|adapter| matches!(adapter.category, tool_adapters::ToolCategory::Coding))
            .map(|adapter| adapter.key)
            .collect();
        if tool_keys.is_empty() {
            return Ok(());
        }
        scenario_service::apply_skills_to_tools(&store, &skill_ids, &tool_keys, mode.into(), false)
    })
    .await?;
    if result.is_ok() {
        refresh_tray_menu_best_effort(&app);
    }
    result
}

#[cfg(test)]
mod tests;
