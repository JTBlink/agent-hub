//! Restore project skills with explicit consent to discard local content.
use super::projects::{
    agent_skill_configs, classify_sync_status, find_best_center_match, read_workspace_skills,
    resolve_agent_skills_roots,
};
use crate::core::path_guard::{ensure_dir_within_root, ensure_safe_skill_relative_path};
use crate::core::{error::AppError, project_library, skill_store::SkillStore, sync_engine};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use tauri::State;

#[tauri::command]
pub async fn update_project_skill_from_center(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    skill_relative_path: String,
    agent: String,
    force: Option<bool>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        restore_from_center(
            &store,
            &project_id,
            &skill_relative_path,
            &agent,
            force.unwrap_or(false),
        )
    })
    .await?
}

pub(crate) fn restore_from_center(
    store: &SkillStore,
    project_id: &str,
    skill_relative_path: &str,
    agent: &str,
    force: bool,
) -> Result<(), AppError> {
    ensure_safe_skill_relative_path(skill_relative_path)?;

    let record = store
        .get_project_by_id(project_id)
        .map_err(AppError::db)?
        .ok_or_else(|| AppError::not_found("Workspace not found"))?;

    let is_managed = record.workspace_type != "linked"
        && project_library::is_managed(Path::new(&record.path), skill_relative_path)?;
    let _guard = if is_managed {
        None
    } else {
        Some(crate::core::project_skill_mutation::lock_project_skill_mutation()?)
    };
    let configs = agent_skill_configs(store);
    let skills = read_workspace_skills(&record, &configs);
    let skill = skills
        .iter()
        .find(|s| s.relative_path == skill_relative_path && s.agent == agent)
        .ok_or_else(|| AppError::not_found("Skill not found in workspace"))?;

    let all_managed = store.get_all_skills().map_err(AppError::db)?;
    let managed = find_best_center_match(skill, &all_managed)
        .ok_or_else(|| AppError::not_found("No matching skill in center"))?;

    if is_managed {
        project_library::update(Path::new(&record.path), skill_relative_path, managed, force)?;
        return Ok(());
    }
    if !force && classify_sync_status(skill, Some(managed)) == "project_newer" {
        return Err(AppError::project_restore_required(
            "Project skill is newer than the Skills Center version",
        ));
    }

    restore_copy(store, &record, skill, managed, force)
}

fn restore_copy(
    store: &SkillStore,
    record: &crate::core::skill_store::ProjectRecord,
    skill: &crate::core::project_scanner::ProjectSkillInfo,
    managed: &crate::core::skill_store::SkillRecord,
    force: bool,
) -> Result<(), AppError> {
    let (skills_root, disabled_root) = resolve_agent_skills_roots(store, record, &skill.agent)
        .ok_or_else(|| AppError::not_found(format!("Unknown agent: {}", skill.agent)))?;
    let target_path = PathBuf::from(&skill.path);
    if target_path.starts_with(&skills_root) {
        ensure_dir_within_root(&target_path, &skills_root)?;
    } else if disabled_root
        .as_ref()
        .map(|root| target_path.starts_with(root))
        .unwrap_or(false)
    {
        let disabled_root = disabled_root.expect("checked above");
        ensure_dir_within_root(&target_path, &disabled_root)?;
    } else {
        return Err(AppError::invalid_input("Invalid skill directory path"));
    }

    let source = PathBuf::from(&managed.central_path);
    let _source_guard =
        crate::core::repo_lock::RepoLock::acquire_foreground("restore project Skill from center")
            .map_err(AppError::io_with_context)?;
    if !crate::core::skill_metadata::is_valid_skill_dir(&source) {
        return Err(AppError::invalid_input(
            "The Skills Center version is missing or invalid; project files were preserved",
        ));
    }
    if !force && target_path.is_dir() {
        let removals = crate::core::removals::removed_paths(&target_path, &source)
            .map_err(AppError::io_with_context)?;
        if !removals.is_empty() {
            return Err(AppError::project_restore_required(format!(
                "Restoring from center would remove local files: {}",
                removals.join(", ")
            )));
        }
    }
    // Restoring content must preserve the existing deployment form. Defaults
    // apply to new deployments, not to replacement of a project's own copy.
    let mode = if target_path.is_symlink() {
        sync_engine::SyncMode::Symlink
    } else {
        sync_engine::SyncMode::Copy
    };
    // The newer-project guard is bypassed only after explicit confirmation.
    // Root validation and the sync engine's replacement checks still apply.
    sync_engine::sync_skill(
        &source,
        &target_path,
        mode,
        sync_engine::ReplacePolicy::UserConfirmed,
    )
    .map_err(AppError::io_with_context)?;
    Ok(())
}

#[cfg(test)]
mod tests;
