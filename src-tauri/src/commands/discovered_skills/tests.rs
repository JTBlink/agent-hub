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
        source_agent: None,
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

#[cfg(unix)]
#[test]
fn deletion_unlinks_alias_into_library_without_removing_library_skill() {
    let repo = repo();
    let central = crate::core::central_repo::skills_dir().join("demo");
    let alias_root = repo._temp.path().join("agent/skills");
    let alias = alias_root.join("demo");
    std::fs::create_dir_all(&central).unwrap();
    std::fs::write(central.join("SKILL.md"), "# Demo").unwrap();
    std::fs::create_dir_all(&alias_root).unwrap();
    std::os::unix::fs::symlink(&central, &alias).unwrap();

    delete_location(&repo.store, &discovered(&alias)).unwrap();

    assert!(!alias.exists());
    assert!(central.join("SKILL.md").exists());
}

#[cfg(unix)]
#[test]
fn deletion_unlinks_unmanaged_alias_even_when_another_link_is_managed() {
    let repo = repo();
    let central = crate::core::central_repo::skills_dir().join("demo");
    let aliases = repo._temp.path().join("agent/skills");
    let selected = aliases.join("selected");
    let managed = aliases.join("managed");
    std::fs::create_dir_all(&central).unwrap();
    std::fs::write(central.join("SKILL.md"), "# Demo").unwrap();
    std::fs::create_dir_all(&aliases).unwrap();
    std::os::unix::fs::symlink(&central, &selected).unwrap();
    std::os::unix::fs::symlink(&central, &managed).unwrap();
    repo.store
        .insert_skill(&imported(&central, &central))
        .unwrap();
    repo.store
        .insert_target(&crate::core::skill_store::SkillTargetRecord {
            id: "target".into(),
            skill_id: "imported".into(),
            tool: "test".into(),
            target_path: managed.to_string_lossy().into_owned(),
            mode: "symlink".into(),
            status: "ok".into(),
            synced_at: None,
            last_error: None,
            source_hash: None,
        })
        .unwrap();

    delete_location(&repo.store, &discovered(&selected)).unwrap();

    assert!(!selected.exists());
    assert!(managed.is_symlink());
    assert!(central.join("SKILL.md").exists());
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
