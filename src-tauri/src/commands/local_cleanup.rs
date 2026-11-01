//! Reviewable cleanup of scanned Skills belonging to configured Agents.
use super::discovered_skills::{delete_location, symlink_resolves_into_library, validate_location};
use crate::core::{
    central_repo,
    error::AppError,
    skill_store::SkillStore,
    sync_metadata,
    tool_adapters::{self, ToolAdapter},
};
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::Arc,
};
use tauri::State;

#[derive(Clone, Serialize)]
pub struct CleanupLocation {
    pub id: String,
    pub tool: String,
    pub path: String,
    pub empty_root: bool,
}
#[derive(Serialize)]
pub struct CleanupFailure {
    pub path: String,
    pub reason: String,
}
#[derive(Default, Serialize)]
pub struct CleanupResult {
    pub removed: usize,
    pub failures: Vec<CleanupFailure>,
}

fn overlaps(a: &Path, b: &Path) -> bool {
    a.starts_with(b)
        || b.starts_with(a)
        || std::fs::canonicalize(a)
            .ok()
            .zip(std::fs::canonicalize(b).ok())
            .is_some_and(|(a, b)| a.starts_with(&b) || b.starts_with(&a))
}

fn roots(
    adapters: &[ToolAdapter],
    installed: &HashSet<String>,
    library: &Path,
    include_installed: bool,
) -> HashMap<String, PathBuf> {
    let mut protected = vec![library.to_path_buf()];
    for adapter in adapters {
        if adapter.is_custom
            || adapter.has_path_override()
            || (!include_installed && installed.contains(&adapter.key))
        {
            protected.extend(adapter.all_scan_dirs());
        }
    }
    adapters
        .iter()
        .filter(|adapter| {
            (include_installed || !installed.contains(&adapter.key))
                && !adapter.is_custom
                && !adapter.has_path_override()
        })
        .filter_map(|adapter| {
            let root = adapter.skills_dir();
            // Additional discovery roots are shared collections, not leftovers
            // owned by this Agent. Never clean those through this operation.
            (root.is_dir()
                && !root.is_symlink()
                && !root.parent().is_some_and(|parent| parent.is_symlink())
                && !protected.iter().any(|path| overlaps(&root, path)))
            .then(|| (adapter.key.clone(), root))
        })
        .collect()
}

pub fn preview_for_cli(
    store: &SkillStore,
    include_installed: bool,
) -> Result<Vec<CleanupLocation>, AppError> {
    let adapters = tool_adapters::all_tool_adapters(store);
    plan(store, &adapters, &installed(&adapters), include_installed)
}

pub fn cleanup_for_cli(
    store: &SkillStore,
    selected: &[String],
    include_installed: bool,
) -> Result<CleanupResult, AppError> {
    sync_metadata::with_repo_lock("clean local Agent Skills", || {
        let adapters = tool_adapters::all_tool_adapters(store);
        Ok(execute(
            store,
            selected,
            &adapters,
            &installed(&adapters),
            include_installed,
        )?)
    })
    .map_err(AppError::io)
}

fn empty_tree(path: &Path) -> bool {
    !path.is_symlink()
        && std::fs::read_dir(path).is_ok_and(|mut entries| {
            entries.all(|entry| {
                entry.is_ok_and(|entry| {
                    entry.file_type().is_ok_and(|kind| kind.is_dir()) && empty_tree(&entry.path())
                })
            })
        })
}

fn prune_empty(path: &Path) {
    if path.is_symlink() {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            if entry.file_type().is_ok_and(|kind| kind.is_dir()) {
                prune_empty(&entry.path());
            }
        }
        let _ = std::fs::remove_dir(path); // Only empty directories can be removed.
    }
}

fn plan(
    store: &SkillStore,
    adapters: &[ToolAdapter],
    installed: &HashSet<String>,
    include_installed: bool,
) -> Result<Vec<CleanupLocation>, AppError> {
    let roots = roots(
        adapters,
        installed,
        &central_repo::skills_dir(),
        include_installed,
    );
    let targets = store.get_all_targets().map_err(AppError::db)?;
    let mut result = Vec::new();
    let mut seen = HashSet::new();
    for record in store.get_all_discovered().map_err(AppError::db)? {
        let Some(root) = roots.get(&record.tool) else {
            continue;
        };
        let path = Path::new(&record.found_path);
        if !path.exists()
            || record.fingerprint.is_none()
            || validate_location(path, std::slice::from_ref(root)).is_err()
            || targets.iter().any(|target| {
                let target_path = Path::new(&target.target_path);
                let matched = if path.is_symlink() {
                    path == target_path
                } else {
                    overlaps(path, target_path)
                };
                matched && !symlink_resolves_into_library(path)
            })
        {
            continue;
        }
        // Lexical dedup: distinct symlinks to one target must each be unlinked.
        if seen.insert((path.to_path_buf(), record.tool.clone())) {
            result.push(CleanupLocation {
                id: record.id,
                tool: record.tool,
                path: record.found_path,
                empty_root: false,
            });
        }
    }
    for (tool, root) in roots {
        if empty_tree(&root) && seen.insert((root.clone(), tool.clone())) {
            let path = root.to_string_lossy().into_owned();
            result.push(CleanupLocation {
                id: format!("empty:{tool}:{path}"),
                tool,
                path,
                empty_root: true,
            });
        }
    }
    result.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(result)
}

fn installed(adapters: &[ToolAdapter]) -> HashSet<String> {
    adapters
        .iter()
        .filter(|adapter| adapter.is_installed())
        .map(|adapter| adapter.key.clone())
        .collect()
}

#[tauri::command]
pub async fn get_local_cleanup_plan(
    store: State<'_, Arc<SkillStore>>,
    include_installed: Option<bool>,
) -> Result<Vec<CleanupLocation>, AppError> {
    let store = store.inner().clone();
    // The desktop one-click action cleans all detected Agent roots by default.
    // Keep the argument optional for older callers, while making installed
    // Agents eligible instead of silently reporting an empty result.
    let include_installed = include_installed.unwrap_or(true);
    tauri::async_runtime::spawn_blocking(move || {
        let adapters = tool_adapters::all_tool_adapters(&store);
        plan(&store, &adapters, &installed(&adapters), include_installed)
    })
    .await?
}

fn execute(
    store: &SkillStore,
    selected: &[String],
    adapters: &[ToolAdapter],
    installed: &HashSet<String>,
    include_installed: bool,
) -> Result<CleanupResult, AppError> {
    // Reuse the scanned records instead of re-reading the whole scan table for
    // every selected item. The plan already checked the primary root boundary.
    let records: HashMap<_, _> = store
        .get_all_discovered()
        .map_err(AppError::db)?
        .into_iter()
        .map(|record| (record.id.clone(), record))
        .collect();
    let current: HashMap<_, _> = plan(store, adapters, installed, include_installed)?
        .into_iter()
        .map(|entry| (entry.id.clone(), entry))
        .collect();
    let roots = roots(
        adapters,
        installed,
        &central_repo::skills_dir(),
        include_installed,
    );
    let mut result = CleanupResult::default();
    let mut seen = HashSet::new();
    let mut removed_paths = HashSet::new();
    for id in selected {
        if !seen.insert(id) {
            continue;
        }
        let Some(entry) = current.get(id) else {
            result.failures.push(CleanupFailure {
                path: id.clone(),
                reason: "Installation or path changed; preview cleanup again".into(),
            });
            continue;
        };
        if removed_paths.contains(&entry.path) {
            continue;
        }
        let outcome = if entry.empty_root {
            if empty_tree(Path::new(&entry.path)) {
                prune_empty(Path::new(&entry.path));
            }
            if Path::new(&entry.path).exists() {
                Err(AppError::invalid_input("Directory is no longer empty"))
            } else {
                Ok(())
            }
        } else {
            records
                .get(id)
                .ok_or_else(|| AppError::not_found("Scan changed; preview again"))
                .and_then(|record| delete_location(store, record))
        };
        match outcome {
            Ok(()) => {
                removed_paths.insert(entry.path.clone());
                result.removed += 1;
                if let Some(root) = roots.get(&entry.tool) {
                    prune_empty(root);
                }
            }
            Err(error) => result.failures.push(CleanupFailure {
                path: entry.path.clone(),
                reason: error.to_string(),
            }),
        }
    }
    if result.removed > 0 {
        if let Err(error) = sync_metadata::write_all_from_db_unlocked(store) {
            result.failures.push(CleanupFailure {
                path: "library metadata".into(),
                reason: error.to_string(),
            });
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn cleanup_uninstalled_agent_skills(
    store: State<'_, Arc<SkillStore>>,
    location_ids: Vec<String>,
    include_installed: Option<bool>,
) -> Result<CleanupResult, AppError> {
    let store = store.inner().clone();
    let include_installed = include_installed.unwrap_or(true);
    tauri::async_runtime::spawn_blocking(move || {
        sync_metadata::with_repo_lock("clean local Agent Skills", || {
            // Fresh installation snapshot after the user confirmed the preview.
            let adapters = tool_adapters::all_tool_adapters(&store);
            Ok(execute(
                &store,
                &location_ids,
                &adapters,
                &installed(&adapters),
                include_installed,
            )?)
        })
        .map_err(AppError::io)
    })
    .await?
}

#[cfg(test)]
mod tests;
