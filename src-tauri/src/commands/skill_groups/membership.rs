//! Membership commands deliberately avoid deployment and library scans.
use super::*;

#[tauri::command]
pub async fn add_skill_to_skill_group(
    app: tauri::AppHandle,
    skill_id: String,
    skill_group_id: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        set_skill_group_skills_internal(&store, &skill_group_id, &[skill_id], true)?;
        // Membership-only edit. We intentionally do NOT sync to disk here,
        // even when this skill group happens to be the legacy `active_scenario_id`,
        // because in the post-v1.16 model skill groups are curation labels, not
        // implicit deployment switches. Users apply skill groups explicitly via
        // SkillGroupBar / the tray, which is where the actual write happens.
        Ok(())
    })
    .await?;
    if result.is_ok() {
        crate::schedule_tray_refresh(&app);
    }
    result
}

#[tauri::command]
pub async fn remove_skill_from_skill_group(
    app: tauri::AppHandle,
    skill_id: String,
    skill_group_id: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        set_skill_group_skills_internal(&store, &skill_group_id, &[skill_id], false)?;
        // Same rationale as add_skill_to_skill_group: editing skill group membership
        // never wipes on-disk skill targets. To remove a skill from a coding
        // agent the caller goes through SkillGroupBar / the tray (or the explicit
        // per-skill unsync command).
        Ok(())
    })
    .await?;
    if result.is_ok() {
        crate::schedule_tray_refresh(&app);
    }
    result
}

/// Apply several membership changes under one repository lock and one metadata
/// write. The Skills view uses this for its batch toolbar.
#[tauri::command]
pub async fn set_skill_group_membership(
    app: tauri::AppHandle,
    skill_ids: Vec<String>,
    skill_group_id: String,
    add: bool,
    store: State<'_, Arc<SkillStore>>,
) -> Result<Vec<String>, AppError> {
    let store = store.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let displaced =
            set_skill_group_skills_internal(&store, &skill_group_id, &skill_ids, add)?;
        Ok(displaced)
    })
    .await?;
    if result.is_ok() {
        crate::schedule_tray_refresh(&app);
    }
    result
}

/// Add or remove a pre-resolved set of skills from one skill group under the repo
/// lock. Membership edits are curation-only and deliberately do not deploy.
///
/// Returns the list of scenario-ids that lost members because of the exclusive
/// move (empty when `add` is false or no skill was displaced).
pub fn set_skill_group_skills_internal(
    store: &SkillStore,
    skill_group_id: &str,
    skill_ids: &[String],
    add: bool,
) -> Result<Vec<String>, AppError> {
    scenario_service::ensure_scenario_exists(store, skill_group_id)?;
    sync_metadata::with_repo_lock(
        if add {
            "add skills to skill group"
        } else {
            "remove skills from skill group"
        },
        || {
            let displaced = store.set_scenario_memberships(skill_group_id, skill_ids, add)?;
            crate::core::file_watcher::mute_self_writes(&sync_metadata::metadata_dir());
            sync_metadata::write_scenario_membership_metadata_unlocked(store, skill_group_id)?;
            for old_id in &displaced {
                sync_metadata::write_scenario_membership_metadata_unlocked(store, old_id)?;
            }
            Ok(displaced)
        },
    )
    .map_err(AppError::db)
}
