//! Reviewable cleanup of scanned Skills belonging to configured Agents.
use super::discovered_skills::{delete_location, validate_location};
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
    Ok(
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
        .map_err(AppError::io)?,
    )
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
            || targets
                .iter()
                .any(|target| overlaps(path, Path::new(&target.target_path)))
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
mod tests {
    use super::*;
    use crate::core::{content_hash, skill_store::DiscoveredSkillRecord};
    fn adapter(root: &Path, key: &str) -> ToolAdapter {
        let mut adapter = tool_adapters::default_tool_adapters().remove(0);
        adapter.key = key.into();
        adapter.relative_skills_dir = root.to_string_lossy().into_owned();
        adapter
    }
    fn discovered(store: &SkillStore, root: &Path, key: &str) -> String {
        let path = root.join("demo");
        std::fs::create_dir_all(&path).unwrap();
        std::fs::write(path.join("SKILL.md"), "# Demo").unwrap();
        let id = format!("location-{key}");
        store
            .insert_discovered(&DiscoveredSkillRecord {
                id: id.clone(),
                tool: key.into(),
                found_path: path.to_string_lossy().into_owned(),
                name_guess: Some("demo".into()),
                fingerprint: Some(content_hash::hash_directory(&path).unwrap()),
                found_at: 0,
                imported_skill_id: None,
            })
            .unwrap();
        id
    }
    #[test]
    fn shared_installed_manual_and_library_roots_are_preserved() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("skills");
        std::fs::create_dir_all(&root).unwrap();
        let a = adapter(&root, "one");
        let b = adapter(&root, "two");
        assert!(roots(
            &[a.clone(), b.clone()],
            &HashSet::from(["two".into()]),
            &tmp.path().join("library"),
            false,
        )
        .is_empty());
        let mut manual = b;
        manual.override_skills_dir = Some(root.to_string_lossy().into_owned());
        assert!(roots(
            &[a.clone(), manual],
            &HashSet::new(),
            &tmp.path().join("library"),
            false,
        )
        .is_empty());
        assert!(roots(&[a], &HashSet::new(), &root, false).is_empty());
    }

    #[test]
    fn installed_agent_roots_are_candidates_when_requested() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("installed/skills");
        std::fs::create_dir_all(root.join("demo")).unwrap();
        let adapter = adapter(&root, "installed");
        let candidates = roots(
            &[adapter],
            &HashSet::from(["installed".into()]),
            &tmp.path().join("library"),
            true,
        );
        assert_eq!(candidates.get("installed"), Some(&root));
    }
    #[test]
    fn installed_after_preview_is_skipped_and_changed_contents_are_preserved() {
        let _guard = central_repo::test_base_dir_lock();
        let tmp = tempfile::tempdir().unwrap();
        central_repo::set_test_base_dir_override(Some(tmp.path().join("library")));
        let store = SkillStore::new(&tmp.path().join("db")).unwrap();
        let root = tmp.path().join("agent/skills");
        let id = discovered(&store, &root, "fixture");
        let adapters = [adapter(&root, "fixture")];
        assert_eq!(
            plan(&store, &adapters, &HashSet::new(), false)
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            execute(
                &store,
                std::slice::from_ref(&id),
                &adapters,
                &HashSet::from(["fixture".into()]),
                false,
            )
            .unwrap()
            .removed,
            0
        );
        std::fs::write(root.join("demo/SKILL.md"), "# Changed").unwrap();
        let result = execute(&store, &[id], &adapters, &HashSet::new(), false).unwrap();
        assert_eq!(result.removed, 0);
        assert_eq!(result.failures.len(), 1);
        assert!(root.join("demo").exists());
        central_repo::set_test_base_dir_override(None);
    }
    #[test]
    fn duplicate_locations_delete_once_prune_empty_skills_and_keep_config() {
        let _guard = central_repo::test_base_dir_lock();
        let tmp = tempfile::tempdir().unwrap();
        central_repo::set_test_base_dir_override(Some(tmp.path().join("library")));
        let store = SkillStore::new(&tmp.path().join("db")).unwrap();
        let root = tmp.path().join("agent/skills");
        let id = discovered(&store, &root, "fixture");
        let adapters = [adapter(&root, "fixture")];
        std::fs::write(root.parent().unwrap().join("config.json"), "keep").unwrap();
        let result = execute(&store, &[id.clone(), id], &adapters, &HashSet::new(), false).unwrap();
        assert_eq!(result.removed, 1);
        assert!(result.failures.is_empty());
        assert!(!root.exists());
        assert!(root.parent().unwrap().join("config.json").is_file());
        central_repo::set_test_base_dir_override(None);
    }
    #[test]
    fn empty_directories_are_candidates_but_links_and_unknown_files_are_not_empty() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("skills");
        std::fs::create_dir_all(root.join("nested")).unwrap();
        assert!(empty_tree(&root));
        std::fs::write(root.join("keep"), "keep").unwrap();
        assert!(!empty_tree(&root));
        prune_empty(&root);
        assert!(root.join("keep").is_file());
        assert!(!root.join("nested").exists());
    }
    #[cfg(unix)]
    #[test]
    fn linked_skill_is_unlinked_but_linked_primary_root_is_not_cleaned() {
        let _guard = central_repo::test_base_dir_lock();
        let tmp = tempfile::tempdir().unwrap();
        central_repo::set_test_base_dir_override(Some(tmp.path().join("library")));
        let store = SkillStore::new(&tmp.path().join("db")).unwrap();
        let root = tmp.path().join("agent/skills");
        let target = tmp.path().join("original");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&target).unwrap();
        std::fs::write(target.join("SKILL.md"), "# Demo").unwrap();
        let link = root.join("demo");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        store
            .insert_discovered(&DiscoveredSkillRecord {
                id: "link".into(),
                tool: "fixture".into(),
                found_path: link.to_string_lossy().into_owned(),
                name_guess: None,
                fingerprint: Some(content_hash::hash_directory(&link).unwrap()),
                found_at: 0,
                imported_skill_id: None,
            })
            .unwrap();
        let result = execute(
            &store,
            &["link".into()],
            &[adapter(&root, "fixture")],
            &HashSet::new(),
            false,
        )
        .unwrap();
        assert_eq!(result.removed, 1);
        assert!(target.join("SKILL.md").exists());
        assert!(!link.exists());
        std::fs::create_dir_all(root.parent().unwrap()).unwrap();
        std::os::unix::fs::symlink(&target, &root).unwrap();
        assert!(roots(
            &[adapter(&root, "fixture")],
            &HashSet::new(),
            &tmp.path().join("library"),
            false,
        )
        .is_empty());
        central_repo::set_test_base_dir_override(None);
    }

    #[test]
    fn shared_uninstalled_path_can_be_selected_by_either_agent_and_is_deleted_once() {
        let _guard = central_repo::test_base_dir_lock();
        let tmp = tempfile::tempdir().unwrap();
        central_repo::set_test_base_dir_override(Some(tmp.path().join("library")));
        let store = SkillStore::new(&tmp.path().join("db")).unwrap();
        let root = tmp.path().join("agent/skills");
        let a = discovered(&store, &root, "one");
        let b = discovered(&store, &root, "two");
        let adapters = [adapter(&root, "one"), adapter(&root, "two")];
        let preview = plan(&store, &adapters, &HashSet::new(), false).unwrap();
        assert_eq!(preview.len(), 2);
        assert!(preview.iter().any(|entry| entry.tool == "two"));
        let result = execute(&store, &[b, a], &adapters, &HashSet::new(), false).unwrap();
        assert_eq!(result.removed, 1);
        assert!(result.failures.is_empty());
        assert!(!root.exists());
        central_repo::set_test_base_dir_override(None);
    }
}
