use super::*;
use crate::core::skill_store::{ProjectRecord, SkillRecord, SkillTargetRecord};

fn skill_at(id: &str, central_path: &Path) -> SkillRecord {
    SkillRecord {
        id: id.into(),
        name: id.into(),
        description: None,
        source_type: "local".into(),
        source_ref: None,
        source_ref_resolved: None,
        source_subpath: None,
        source_branch: None,
        source_revision: None,
        source_agent: None,
        remote_revision: None,
        central_path: central_path.to_string_lossy().into(),
        content_hash: None,
        enabled: true,
        created_at: 0,
        updated_at: 0,
        status: "ok".into(),
        update_status: "unknown".into(),
        last_checked_at: None,
        last_check_error: None,
    }
}

/// Central repo with one skill dir and metadata whose skills/ is empty (#421).
fn library_with_empty_metadata() -> (
    std::sync::MutexGuard<'static, ()>,
    tempfile::TempDir,
    SkillStore,
    PathBuf,
) {
    let lock = central_repo::test_base_dir_lock();
    let tmp = tempfile::tempdir().unwrap();
    let base = tmp.path().join("repo");
    central_repo::set_test_base_dir_override(Some(base.clone()));
    let skill_dir = central_repo::skills_dir().join("s");
    std::fs::create_dir_all(&skill_dir).unwrap();
    std::fs::write(skill_dir.join("SKILL.md"), "---\nname: s\n---\n").unwrap();
    std::fs::create_dir_all(sync_metadata::metadata_dir().join("skills")).unwrap();
    std::fs::write(sync_metadata::metadata_dir().join("schema.json"), "{}").unwrap();
    let store = SkillStore::new(&base.join("test.db")).unwrap();
    (lock, tmp, store, skill_dir)
}

#[test]
fn empty_metadata_is_rebuilt_from_an_intact_database() {
    let (_lock, _tmp, store, skill_dir) = library_with_empty_metadata();
    store.insert_skill(&skill_at("s", &skill_dir)).unwrap();

    reindex_or_rebuild_metadata(&store).unwrap();

    assert!(store.get_skill_by_id("s").unwrap().is_some());
    let written = std::fs::read_dir(sync_metadata::metadata_dir().join("skills"))
        .unwrap()
        .count();
    assert_eq!(written, 1, "metadata rebuilt from the database");
    central_repo::set_test_base_dir_override(None);
}

#[test]
fn empty_metadata_still_refuses_when_the_database_is_empty_or_stale() {
    let (_lock, tmp, store, _skill_dir) = library_with_empty_metadata();
    let err = reindex_or_rebuild_metadata(&store).unwrap_err();
    assert!(err.is::<sync_metadata::EmptySkillMetadata>());

    store
        .insert_skill(&skill_at("gone", &tmp.path().join("missing")))
        .unwrap();
    assert!(reindex_or_rebuild_metadata(&store).is_err());
    central_repo::set_test_base_dir_override(None);
}

#[test]
fn empty_metadata_still_refuses_when_the_database_misses_a_skill_dir() {
    let (_lock, _tmp, store, skill_dir) = library_with_empty_metadata();
    store.insert_skill(&skill_at("s", &skill_dir)).unwrap();
    let unrecorded = central_repo::skills_dir().join("cat/b");
    std::fs::create_dir_all(&unrecorded).unwrap();
    std::fs::write(unrecorded.join("SKILL.md"), "---\nname: b\n---\n").unwrap();

    let err = reindex_or_rebuild_metadata(&store).unwrap_err();
    assert!(err.is::<sync_metadata::EmptySkillMetadata>());
    assert!(store.get_skill_by_id("s").unwrap().is_some());
    central_repo::set_test_base_dir_override(None);
}

#[test]
#[cfg(unix)]
fn repoint_after_move_rewrites_db_paths_and_only_links_into_the_old_library() {
    let tmp = tempfile::tempdir().unwrap();
    let from = tmp.path().join("old");
    let to = tmp.path().join("new");
    std::fs::create_dir_all(to.join("skills/s")).unwrap();
    std::fs::create_dir_all(to.join("skills/cat/nested")).unwrap();
    let elsewhere = tmp.path().join("elsewhere");
    std::fs::create_dir_all(&elsewhere).unwrap();

    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
    store
        .insert_skill(&SkillRecord {
            id: "s".into(),
            name: "s".into(),
            description: None,
            source_type: "local".into(),
            source_ref: Some(from.join("skills/s").to_string_lossy().into()),
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            source_agent: None,
            remote_revision: None,
            central_path: from.join("skills/s").to_string_lossy().into(),
            content_hash: None,
            enabled: true,
            created_at: 0,
            updated_at: 0,
            status: "ok".into(),
            update_status: "unknown".into(),
            last_checked_at: None,
            last_check_error: None,
        })
        .unwrap();

    // A project deployment: no target record, so only this pass can fix it.
    let project_root = tmp.path().join("project-skills");
    std::fs::create_dir_all(&project_root).unwrap();
    std::os::unix::fs::symlink(from.join("skills/s"), project_root.join("s")).unwrap();
    std::os::unix::fs::symlink(&elsewhere, project_root.join("foreign")).unwrap();
    // Nested and unrecorded: a category dir inside the project root.
    std::fs::create_dir_all(project_root.join("cat")).unwrap();
    std::os::unix::fs::symlink(
        from.join("skills/cat/nested"),
        project_root.join("cat/nested"),
    )
    .unwrap();
    store
        .insert_project(&ProjectRecord {
            id: "p".into(),
            name: "p".into(),
            path: project_root.to_string_lossy().into(),
            workspace_type: "linked".into(),
            linked_agent_key: Some("claude_code".into()),
            linked_agent_name: None,
            disabled_path: None,
            sort_order: 0,
            created_at: 0,
            updated_at: 0,
            visited_at: None,
        })
        .unwrap();

    // A nested recorded deployment (Hermes-style category dir), outside
    // any scanned root and not in the active skill group.
    let nested = tmp.path().join("agent/cat/nested");
    std::fs::create_dir_all(nested.parent().unwrap()).unwrap();
    std::os::unix::fs::symlink(from.join("skills/cat/nested"), &nested).unwrap();
    store
        .insert_target(&SkillTargetRecord {
            id: "t".into(),
            skill_id: "s".into(),
            tool: "hermes".into(),
            target_path: nested.to_string_lossy().into(),
            mode: "symlink".into(),
            status: "ok".into(),
            synced_at: None,
            last_error: None,
            source_hash: None,
        })
        .unwrap();

    assert_eq!(repoint_after_move(&store, &from, &to).unwrap(), 0);
    assert_eq!(
        std::fs::read_link(&nested).unwrap(),
        to.join("skills/cat/nested")
    );

    assert_eq!(
        std::fs::read_link(project_root.join("s")).unwrap(),
        to.join("skills/s")
    );
    assert_eq!(
        std::fs::read_link(project_root.join("cat/nested")).unwrap(),
        to.join("skills/cat/nested")
    );
    assert_eq!(
        std::fs::read_link(project_root.join("foreign")).unwrap(),
        elsewhere,
        "a link that does not point into the old library is not ours to touch"
    );
    let skill = store.get_all_skills().unwrap().remove(0);
    assert_eq!(skill.central_path, to.join("skills/s").to_string_lossy());
    assert_eq!(
        skill.source_ref.as_deref(),
        Some(to.join("skills/s").to_string_lossy().as_ref())
    );
}

#[test]
#[cfg(unix)]
fn repoints_legacy_shared_agent_link_without_target_record() {
    let tmp = tempfile::tempdir().unwrap();
    let legacy = tmp.path().join(".agents/skills");
    let current = tmp.path().join(".agent-hub/skills");
    let codex_root = tmp.path().join(".codex/skills");
    std::fs::create_dir_all(legacy.join("browser-use")).unwrap();
    std::fs::create_dir_all(current.join("browser-use")).unwrap();
    std::fs::create_dir_all(&codex_root).unwrap();
    std::os::unix::fs::symlink(legacy.join("browser-use"), codex_root.join("browser-use")).unwrap();

    // Project roots are scanned independently of deployment records. This
    // models an old Codex link left behind after the shared library move.
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
    store
        .insert_project(&ProjectRecord {
            id: "codex".into(),
            name: "Codex skills".into(),
            path: codex_root.to_string_lossy().into(),
            workspace_type: "linked".into(),
            linked_agent_key: Some("codex".into()),
            linked_agent_name: None,
            disabled_path: None,
            sort_order: 0,
            created_at: 0,
            updated_at: 0,
            visited_at: None,
        })
        .unwrap();

    assert!(store.get_all_targets().unwrap().is_empty());
    assert_eq!(repoint_after_move(&store, &legacy, &current).unwrap(), 0);
    assert_eq!(
        std::fs::read_link(codex_root.join("browser-use")).unwrap(),
        current.join("browser-use")
    );
}
