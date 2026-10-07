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
    if path_guard::is_path_safe(&library, path) || path_guard::is_path_safe(path, &library) {
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
    if targets.iter().any(|target| {
        target.target_path == record.found_path
            || std::fs::canonicalize(&target.target_path)
                .ok()
                .zip(std::fs::canonicalize(path).ok())
                .is_some_and(|(target, local)| target == local)
    }) {
        return Err(AppError::invalid_input(
            "Skill is now managed; remove its deployment from the agent workspace",
        ));
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
mod tests {
    use super::*;

    struct TestRepo {
        _lock: std::sync::MutexGuard<'static, ()>,
        _temp: tempfile::TempDir,
        store: SkillStore,
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            crate::core::central_repo::set_test_base_dir_override(None);
        }
    }

    fn repo() -> TestRepo {
        let lock = crate::core::central_repo::test_base_dir_lock();
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("repo");
        std::fs::create_dir_all(&base).unwrap();
        crate::core::central_repo::set_test_base_dir_override(Some(base.clone()));
        TestRepo {
            _lock: lock,
            store: SkillStore::new(&base.join("store.db")).unwrap(),
            _temp: temp,
        }
    }

    fn discovered(path: &Path) -> DiscoveredSkillRecord {
        DiscoveredSkillRecord {
            id: "location".into(),
            tool: "test".into(),
            found_path: path.to_string_lossy().into_owned(),
            name_guess: None,
            fingerprint: Some(content_hash::hash_directory(path).unwrap()),
            found_at: 0,
            imported_skill_id: None,
        }
    }

    fn imported(source: &Path, central: &Path) -> crate::core::skill_store::SkillRecord {
        crate::core::skill_store::SkillRecord {
            id: "imported".into(),
            name: "demo".into(),
            description: None,
            source_type: "import".into(),
            source_ref: Some(source.to_string_lossy().into_owned()),
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            remote_revision: None,
            central_path: central.to_string_lossy().into_owned(),
            content_hash: None,
            enabled: true,
            created_at: 0,
            updated_at: 0,
            status: "ok".into(),
            update_status: "local_only".into(),
            last_checked_at: None,
            last_check_error: None,
        }
    }

    #[test]
    fn removes_only_selected_directory_and_keeps_imported_source_resolvable() {
        let repo = repo();
        let selected = repo._temp.path().join("selected");
        let sibling = repo._temp.path().join("sibling");
        let central = crate::core::central_repo::skills_dir().join("demo");
        for path in [&selected, &sibling, &central] {
            std::fs::create_dir_all(path).unwrap();
            std::fs::write(path.join("SKILL.md"), "# Demo").unwrap();
        }
        repo.store
            .insert_skill(&imported(&selected, &central))
            .unwrap();
        delete_location(&repo.store, &discovered(&selected)).unwrap();
        assert!(!selected.exists());
        assert!(sibling.join("SKILL.md").exists());
        assert!(central.join("SKILL.md").exists());
        assert_eq!(
            repo.store.get_all_skills().unwrap()[0]
                .source_ref
                .as_deref(),
            central.to_str()
        );
    }

    #[cfg(unix)]
    #[test]
    fn deletion_unlinks_alias_without_removing_original_or_redirecting_its_source() {
        let repo = repo();
        let original = repo._temp.path().join("original");
        let alias = repo._temp.path().join("alias");
        let central = crate::core::central_repo::skills_dir().join("demo");
        for path in [&original, &central] {
            std::fs::create_dir_all(path).unwrap();
            std::fs::write(path.join("SKILL.md"), "# Demo").unwrap();
        }
        std::os::unix::fs::symlink(&original, &alias).unwrap();
        repo.store
            .insert_skill(&imported(&original, &central))
            .unwrap();
        delete_location(&repo.store, &discovered(&alias)).unwrap();
        assert!(!alias.exists());
        assert!(original.join("SKILL.md").exists());
        assert_eq!(
            repo.store.get_all_skills().unwrap()[0]
                .source_ref
                .as_deref(),
            original.to_str()
        );
    }

    #[test]
    fn refuses_library_content_even_when_scanned_through_a_custom_agent_root() {
        let repo = repo();
        let path = crate::core::central_repo::skills_dir().join("demo");
        std::fs::create_dir_all(&path).unwrap();
        std::fs::write(path.join("SKILL.md"), "# Demo").unwrap();
        assert!(delete_location(&repo.store, &discovered(&path)).is_err());
        assert!(path.join("SKILL.md").exists());
    }

    #[test]
    fn refuses_location_that_became_a_managed_deployment() {
        let repo = repo();
        let path = repo._temp.path().join("demo");
        std::fs::create_dir_all(&path).unwrap();
        std::fs::write(path.join("SKILL.md"), "# Demo").unwrap();
        repo.store.insert_skill(&imported(&path, &path)).unwrap();
        repo.store
            .insert_target(&crate::core::skill_store::SkillTargetRecord {
                id: "target".into(),
                skill_id: "imported".into(),
                tool: "test".into(),
                target_path: path.to_string_lossy().into_owned(),
                mode: "copy".into(),
                status: "ok".into(),
                synced_at: None,
                last_error: None,
                source_hash: None,
            })
            .unwrap();
        assert!(delete_location(&repo.store, &discovered(&path)).is_err());
        assert!(path.join("SKILL.md").exists());
        assert!(resolve_location(&repo.store, "stale-id").is_err());
    }

    #[test]
    fn refuses_root_traversal_and_outside_paths() {
        let temp = tempfile::tempdir().unwrap();
        let roots = vec![temp.path().to_path_buf()];
        assert!(validate_location(temp.path(), &roots).is_err());
        assert!(validate_location(&temp.path().join("../outside"), &roots).is_err());
        assert!(validate_location(&temp.path().join("category/demo"), &roots).is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn allows_unlinking_skill_but_refuses_symlinked_parent_escape() {
        let temp = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let roots = vec![temp.path().to_path_buf()];
        let link = temp.path().join("demo");
        std::os::unix::fs::symlink(outside.path(), &link).unwrap();
        assert!(validate_location(&link, &roots).is_ok());
        assert!(validate_location(&link.join("child"), &roots).is_err());
        sync_engine::remove_target(&link).unwrap();
        assert!(outside.path().exists());
    }

    #[test]
    fn refuses_delete_when_contents_changed_after_scan() {
        let temp = tempfile::tempdir().unwrap();
        let store = SkillStore::new(&temp.path().join("store.db")).unwrap();
        let skill = temp.path().join("demo");
        std::fs::create_dir(&skill).unwrap();
        std::fs::write(skill.join("SKILL.md"), "# Original").unwrap();
        let record = DiscoveredSkillRecord {
            id: "location".into(),
            tool: "test".into(),
            found_path: skill.to_string_lossy().into_owned(),
            name_guess: None,
            fingerprint: Some(content_hash::hash_directory(&skill).unwrap()),
            found_at: 0,
            imported_skill_id: None,
        };
        std::fs::write(skill.join("SKILL.md"), "# Changed").unwrap();
        assert!(delete_location(&store, &record).is_err());
        assert!(skill.exists());
    }
}
