//! Manage one scanned local installation without adopting or deleting its siblings.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::State;

use super::projects::{ensure_dir_within_root, ensure_safe_skill_relative_path};
use crate::core::{
    content_hash,
    error::AppError,
    path_guard, scenario_service, skill_metadata,
    skill_store::{DiscoveredSkillRecord, SkillStore},
    sync_engine, sync_metadata, tool_adapters,
};

pub(super) fn symlink_resolves_into_library(path: &Path) -> bool {
    if !path.is_symlink() {
        return false;
    }
    let library = crate::core::central_repo::skills_dir();
    let Ok(library) = library.canonicalize() else {
        return false;
    };
    std::fs::canonicalize(path).is_ok_and(|resolved| resolved.starts_with(&library))
}

pub(super) fn validate_location(path: &Path, roots: &[PathBuf]) -> Result<(), AppError> {
    for root in roots {
        let Ok(relative) = path.strip_prefix(root) else {
            continue;
        };
        if ensure_safe_skill_relative_path(&relative.to_string_lossy()).is_err() {
            continue;
        }
        ensure_dir_within_root(path, root)?;
        // The final component may be a link; only its parent must stay in the
        // root. remove_target unlinks it without removing the linked directory.
        if path
            .parent()
            .is_some_and(|parent| path_guard::is_path_safe(root, parent))
        {
            return Ok(());
        }
    }
    Err(AppError::invalid_input(
        "Local skill is outside the scanned directories; scan again",
    ))
}

pub(super) fn resolve_location(
    store: &SkillStore,
    location_id: &str,
) -> Result<DiscoveredSkillRecord, AppError> {
    let record = store
        .get_all_discovered()
        .map_err(AppError::db)?
        .into_iter()
        .find(|record| record.id == location_id)
        .ok_or_else(|| AppError::not_found("Local scan is out of date; scan again"))?;
    let adapter = tool_adapters::all_tool_adapters(store)
        .into_iter()
        .find(|adapter| adapter.key == record.tool)
        .ok_or_else(|| AppError::not_found("Agent no longer exists; scan again"))?;
    let mut roots = adapter.additional_existing_scan_dirs();
    roots.push(adapter.skills_dir());
    validate_location(Path::new(&record.found_path), &roots)?;
    Ok(record)
}

#[tauri::command]
pub async fn get_discovered_skill_document(
    store: State<'_, Arc<SkillStore>>,
    location_id: String,
) -> Result<String, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let record = resolve_location(&store, &location_id)?;
        let path = Path::new(&record.found_path);
        for marker in skill_metadata::SKILL_DIR_MARKERS {
            let file = path.join(marker);
            if file.is_file() && path_guard::is_path_safe(path, &file) {
                return std::fs::read_to_string(file).map_err(AppError::io);
            }
        }
        Err(AppError::not_found("No skill document found"))
    })
    .await?
}

pub(super) fn delete_location(
    store: &SkillStore,
    record: &DiscoveredSkillRecord,
) -> Result<(), AppError> {
    let path = Path::new(&record.found_path);
    let library = crate::core::central_repo::skills_dir();
    let is_link =
        std::fs::symlink_metadata(path).is_ok_and(|metadata| metadata.file_type().is_symlink());
    // Check the entry's parent separately: resolving the final link would
    // mistake an Agent alias for the shared library entry it points to.
    if path == library
        || sync_engine::is_library_entry(path)
        || (!is_link
            && (path_guard::is_path_safe(&library, path)
                || path_guard::is_path_safe(path, &library)))
    {
        return Err(AppError::invalid_input(
            "Cannot delete the skill library from local scan",
        ));
    }
    let fingerprint = record
        .fingerprint
        .as_deref()
        .ok_or_else(|| AppError::invalid_input("Cannot verify local skill content; scan again"))?;
    if content_hash::hash_directory(path).map_err(AppError::io)? != fingerprint {
        return Err(AppError::invalid_input(
            "Local skill changed since scanning; scan again before deleting",
        ));
    }
    let targets = store.get_all_targets().map_err(AppError::db)?;
    let managed_targets: Vec<_> = targets
        .iter()
        .filter(|target| {
            target.target_path == record.found_path
                || (!is_link
                    && std::fs::canonicalize(&target.target_path)
                        .ok()
                        .zip(std::fs::canonicalize(path).ok())
                        .is_some_and(|(target, local)| target == local))
        })
        .collect();
    if !managed_targets.is_empty() {
        if !symlink_resolves_into_library(path) {
            return Err(AppError::invalid_input(
                "Skill is now managed; remove its deployment from the agent workspace",
            ));
        }
        for target in &managed_targets {
            let _ = store.delete_target(&target.skill_id, &target.tool);
        }
    }
    scenario_service::detach_source_refs_from_adoption_target(store, path)?;
    sync_engine::remove_target(path).map_err(AppError::io)?;
    Ok(())
}

#[tauri::command]
pub async fn delete_discovered_skill(
    store: State<'_, Arc<SkillStore>>,
    location_id: String,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        sync_metadata::with_repo_lock("delete scanned local skill", || {
            let record = resolve_location(&store, &location_id)?;
            delete_location(&store, &record)?;
            sync_metadata::write_all_from_db_unlocked(&store)?;
            Ok(())
        })
        .map_err(AppError::io)
    })
    .await?
}

#[cfg(test)]
mod tests;
