use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, State};

use crate::core::{
    error::AppError, scenario_service, skill_store::SkillStore, sync_engine, sync_metadata,
    tool_adapters, tool_service,
};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct SkillToolToggleDto {
    pub tool: String,
    pub display_name: String,
    pub installed: bool,
    pub globally_enabled: bool,
    pub enabled: bool,
}

fn disabled_tools(store: &SkillStore) -> Vec<String> {
    tool_service::get_disabled_tools(store)
}

/// Sync commands fire one call per `(skill, agent)` pair when SkillGroupBar
/// applies a skill group from the in-app workspace view. Route through the
/// coalescing refresh so a burst rebuilds the tray at most once per window
/// instead of once per row.
fn schedule_tray_refresh(app: &AppHandle) {
    crate::schedule_tray_refresh(app);
}

fn sync_skill_to_tool_internal(
    store: &SkillStore,
    skill_id: &str,
    tool: &str,
    force: bool,
) -> Result<(), AppError> {
    scenario_service::sync_single_skill_to_tool(
        store,
        skill_id,
        tool,
        scenario_service::DeployIntent::Managed,
        force,
    )
}

/// The disk-side half of turning a skill group toggle off for one tool: the
/// `skill_targets` record always goes, while whatever is at the recorded path
/// is only removed when it still matches what we deployed (#435).
fn unsync_skill_for_tool_in_skill_group(
    store: &SkillStore,
    skill_id: &str,
    tool: &str,
) -> Result<(), AppError> {
    let targets = store
        .get_targets_for_skill(skill_id)
        .map_err(AppError::db)?;
    if let Some(target) = targets.iter().find(|target| target.tool == tool) {
        // Same survivor check as `unsync_skill_from_tool`: another tool
        // sharing this skills directory keeps its deployment.
        let still_referenced = targets
            .iter()
            .any(|other| other.tool != tool && other.target_path == target.target_path);
        if still_referenced {
            return store.delete_target(skill_id, tool).map_err(AppError::db);
        }
        sync_engine::remove_recorded_target_or_warn(
            &PathBuf::from(&target.target_path),
            &target.mode,
        );
    }
    store.delete_target(skill_id, tool).map_err(AppError::db)
}

#[tauri::command]
pub async fn sync_skill_to_tool(
    app: AppHandle,
    skill_id: String,
    tool: String,
    force: Option<bool>,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    let force = force.unwrap_or(false);
    let result = tauri::async_runtime::spawn_blocking(move || {
        let outcome = (|| -> Result<(), AppError> {
            sync_skill_to_tool_internal(&store, &skill_id, &tool, force)?;

            if let Ok(Some(active_id)) = store.get_active_scenario_id() {
                let skill_ids = store
                    .get_skill_ids_for_scenario(&active_id)
                    .map_err(AppError::db)?;
                if skill_ids.contains(&skill_id) {
                    let adapter_keys: Vec<String> =
                        tool_adapters::enabled_deployable_adapters(&store)
                            .iter()
                            .map(|a| a.key.clone())
                            .collect();
                    store
                        .ensure_scenario_skill_tool_defaults(&active_id, &skill_id, &adapter_keys)
                        .map_err(AppError::db)?;
                    store
                        .set_scenario_skill_tool_enabled(&active_id, &skill_id, &tool, true)
                        .map_err(AppError::db)?;
                }
            }

            Ok(())
        })();
        log_sync_outcome(&store, "enable", &skill_id, &tool, outcome.as_ref());
        outcome
    })
    .await?;
    if result.is_ok() {
        schedule_tray_refresh(&app);
    }
    result
}

#[tauri::command]
pub async fn unsync_skill_from_tool(
    app: AppHandle,
    skill_id: String,
    tool: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let outcome = (|| -> Result<(), AppError> {
            let targets = store
                .get_targets_for_skill(&skill_id)
                .map_err(AppError::db)?;

            // Toggling a skill off is the GUI twin of `skills undeploy`, so it
            // needs the same protection: the row says we deployed here, but if
            // the user has since replaced our artifact with content of their
            // own, that content is not ours to delete (#363).
            if let Some(target) = targets.iter().find(|t| t.tool == tool) {
                let target_path = PathBuf::from(&target.target_path);
                // Several tools can resolve to one skills directory, so this
                // exact path may still be deployed for another (skill, tool)
                // that is staying. `apply_remove` has this survivor check;
                // without it here, switching agent A off deletes agent B's
                // live deployment.
                let still_referenced = store
                    .get_all_targets()
                    .map_err(AppError::db)?
                    .into_iter()
                    .any(|other| {
                        other.target_path == target.target_path
                            && !(other.skill_id == skill_id && other.tool == tool)
                    });
                if still_referenced {
                    log::debug!(
                        "unsync: keeping {} (still referenced by another target)",
                        target_path.display()
                    );
                } else {
                    match sync_engine::remove_recorded_target(&target_path, &target.mode) {
                        Ok(true) => {}
                        Ok(false) => log::warn!(
                            "unsync: preserving {} — no longer matches its recorded {} deployment; \
                             removing the record only",
                            target_path.display(),
                            target.mode
                        ),
                        Err(e) => {
                            log::warn!("unsync: failed to remove {}: {e}", target_path.display())
                        }
                    }
                }
            }

            store
                .delete_target(&skill_id, &tool)
                .map_err(AppError::db)?;

            if let Ok(Some(active_id)) = store.get_active_scenario_id() {
                let skill_ids = store
                    .get_skill_ids_for_scenario(&active_id)
                    .map_err(AppError::db)?;
                if skill_ids.contains(&skill_id) {
                    let adapter_keys: Vec<String> =
                        tool_adapters::enabled_deployable_adapters(&store)
                            .iter()
                            .map(|a| a.key.clone())
                            .collect();
                    store
                        .ensure_scenario_skill_tool_defaults(&active_id, &skill_id, &adapter_keys)
                        .map_err(AppError::db)?;
                    store
                        .set_scenario_skill_tool_enabled(&active_id, &skill_id, &tool, false)
                        .map_err(AppError::db)?;
                }
            }

            Ok(())
        })();
        log_sync_outcome(&store, "disable", &skill_id, &tool, outcome.as_ref());
        outcome
    })
    .await?;
    if result.is_ok() {
        schedule_tray_refresh(&app);
    }
    result
}

fn log_sync_outcome(
    store: &SkillStore,
    action: &str,
    skill_id: &str,
    tool: &str,
    outcome: Result<&(), &AppError>,
) {
    let name = store
        .get_skill_by_id(skill_id)
        .ok()
        .flatten()
        .map(|s| s.name)
        .unwrap_or_default();
    let mut draft = crate::core::audit_log::AuditDraft::new(action)
        .skill(skill_id.to_string(), name)
        .tool(tool.to_string());
    draft = match outcome {
        Ok(_) => draft.ok(),
        Err(e) => draft.fail(e.to_string()),
    };
    store.log_audit(draft);
}

#[tauri::command]
pub async fn get_skill_tool_toggles(
    skill_id: String,
    skill_group_id: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<Vec<SkillToolToggleDto>, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let skill_ids = store
            .get_skill_ids_for_scenario(&skill_group_id)
            .map_err(AppError::db)?;
        if !skill_ids.contains(&skill_id) {
            return Err(AppError::not_found(
                "Skill is not enabled in this skill group",
            ));
        }

        let disabled = disabled_tools(&store);
        let all_adapters = tool_adapters::all_tool_adapters(&store);
        let default_enabled_keys: Vec<String> = all_adapters
            .iter()
            .filter(|adapter| adapter.is_installed() && !disabled.contains(&adapter.key))
            .map(|adapter| adapter.key.clone())
            .collect();
        store
            .ensure_scenario_skill_tool_defaults(&skill_group_id, &skill_id, &default_enabled_keys)
            .map_err(AppError::db)?;

        let toggles = store
            .get_scenario_skill_tool_toggles(&skill_group_id, &skill_id)
            .map_err(AppError::db)?;
        let enabled_map: std::collections::HashMap<String, bool> = toggles
            .into_iter()
            .map(|toggle| (toggle.tool, toggle.enabled))
            .collect();

        Ok(all_adapters
            .into_iter()
            .map(|adapter| {
                let globally_enabled = !disabled.contains(&adapter.key);
                let available = adapter.is_installed() && globally_enabled;
                SkillToolToggleDto {
                    // Unavailable tools are always presented as disabled in UI.
                    enabled: if available {
                        enabled_map.get(&adapter.key).copied().unwrap_or(false)
                    } else {
                        false
                    },
                    tool: adapter.key.clone(),
                    display_name: adapter.display_name.clone(),
                    installed: adapter.is_installed(),
                    globally_enabled,
                }
            })
            .collect())
    })
    .await?
}

#[tauri::command]
pub async fn set_skill_tool_toggle(
    app: AppHandle,
    skill_id: String,
    skill_group_id: String,
    tool: String,
    enabled: bool,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let skill_ids = store
            .get_skill_ids_for_scenario(&skill_group_id)
            .map_err(AppError::db)?;
        if !skill_ids.contains(&skill_id) {
            return Err(AppError::not_found(
                "Skill is not enabled in this skill group",
            ));
        }

        let adapter = tool_adapters::find_adapter_with_store(&store, &tool)
            .ok_or_else(|| AppError::not_found(format!("Unknown tool: {}", tool)))?;
        let disabled = disabled_tools(&store);
        let globally_enabled = !disabled.contains(&tool);

        if enabled {
            if !adapter.is_installed() {
                return Err(AppError::not_found(format!(
                    "{} is not installed",
                    adapter.display_name
                )));
            }
            if !globally_enabled {
                return Err(AppError::invalid_input(format!(
                    "{} is disabled",
                    adapter.display_name
                )));
            }
        }

        sync_metadata::with_repo_lock("set skill tool toggle", || {
            store.set_scenario_skill_tool_enabled(&skill_group_id, &skill_id, &tool, enabled)?;
            sync_metadata::write_all_from_db_unlocked(&store)
        })
        .map_err(AppError::db)?;

        let is_active = store
            .get_active_scenario_id()
            .map_err(AppError::db)?
            .as_deref()
            == Some(skill_group_id.as_str());
        if is_active {
            if enabled {
                sync_skill_to_tool_internal(&store, &skill_id, &tool, false)?;
            } else {
                unsync_skill_for_tool_in_skill_group(&store, &skill_id, &tool)?;
            }
        }

        Ok(())
    })
    .await?;
    if result.is_ok() {
        schedule_tray_refresh(&app);
    }
    result
}

#[cfg(test)]
mod tests;
