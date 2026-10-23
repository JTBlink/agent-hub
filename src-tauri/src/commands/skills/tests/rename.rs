use super::*;
use crate::core::{content_hash, skill_store::ScenarioRecord};

fn deploy(repo: &TestRepo, central: &Path, root: &Path, tool: &str, mode: &str) -> PathBuf {
    let target = root.join("old-skill");
    let actual = sync_engine::sync_skill(
        central,
        &target,
        sync_engine::sync_mode_for_tool(tool, Some(mode)),
        sync_engine::ReplacePolicy::NoClobber,
    )
    .unwrap();
    repo.store
        .insert_target(&SkillTargetRecord {
            id: tool.into(),
            skill_id: "skill-id".into(),
            tool: tool.into(),
            target_path: target.to_string_lossy().into_owned(),
            mode: match actual {
                sync_engine::SyncMode::Copy => "copy",
                sync_engine::SyncMode::Symlink => "symlink",
            }
            .into(),
            status: "ok".into(),
            synced_at: Some(1),
            last_error: None,
            source_hash: None,
        })
        .unwrap();
    target
}

#[test]
fn rename_preserves_identity_memberships_and_updates_copies_and_self_source() {
    let repo = test_repo();
    let central = write_skill_dir("old-skill");
    fs::write(central.join("notes.txt"), "retained").unwrap();
    let mut skill = sample_skill("skill-id", "old-skill", &central);
    skill.enabled = false;
    repo.store.insert_skill(&skill).unwrap();
    repo.store
        .set_tags_for_skill(&skill.id, &["team".into()])
        .unwrap();
    repo.store
        .insert_scenario(&ScenarioRecord {
            id: "group".into(),
            name: "Group".into(),
            description: None,
            icon: None,
            sort_order: 0,
            created_at: 1,
            updated_at: 1,
        })
        .unwrap();
    repo.store
        .add_skill_to_scenario("group", &skill.id)
        .unwrap();
    let targets = tempdir().unwrap();
    let old_target = deploy(&repo, &central, targets.path(), "codex", "copy");

    rename_skill_internal(&repo.store, &skill.id, "new-skill").unwrap();

    let new = central_repo::skills_dir().join("new-skill");
    assert!(!central.exists());
    assert!(!old_target.exists());
    assert_eq!(
        fs::read_to_string(new.join("notes.txt")).unwrap(),
        "retained"
    );
    assert_eq!(
        skill_metadata::parse_skill_md(&new).name.as_deref(),
        Some("new-skill")
    );
    let copy = targets.path().join("new-skill");
    assert_eq!(
        skill_metadata::parse_skill_md(&copy).name.as_deref(),
        Some("new-skill")
    );
    let updated = repo.store.get_skill_by_id(&skill.id).unwrap().unwrap();
    assert_eq!(repo.store.get_all_skills().unwrap().len(), 1);
    assert_eq!(updated.created_at, skill.created_at);
    assert!(!updated.enabled);
    assert_eq!(updated.source_ref.as_deref(), new.to_str());
    assert_eq!(
        updated.content_hash.as_deref(),
        Some(content_hash::hash_directory(&new).unwrap().as_str())
    );
    assert_eq!(
        repo.store.get_scenarios_for_skill(&skill.id).unwrap(),
        vec!["group"]
    );
    assert_eq!(repo.store.get_tags_map().unwrap()[&skill.id], vec!["team"]);
    let records = repo.store.get_targets_for_skill(&skill.id).unwrap();
    assert_eq!(records[0].target_path, copy.to_string_lossy());
    assert_eq!(records[0].source_hash, updated.content_hash);
    assert!(!central_repo::base_dir().join("local-sources").exists());
    assert_eq!(fs::read_dir(targets.path()).unwrap().count(), 1);
}

#[test]
fn rename_preserves_external_source_and_retargets_links() {
    let repo = test_repo();
    let central = write_skill_dir("old-skill");
    let external = tempdir().unwrap();
    fs::write(external.path().join("SKILL.md"), "original source").unwrap();
    let mut skill = sample_skill("skill-id", "old-skill", &central);
    skill.source_ref = Some(external.path().to_string_lossy().into_owned());
    repo.store.insert_skill(&skill).unwrap();
    let targets = tempdir().unwrap();
    let old_target = deploy(&repo, &central, targets.path(), "codex", "symlink");

    rename_skill_internal(&repo.store, &skill.id, "new-skill").unwrap();

    let new = central_repo::skills_dir().join("new-skill");
    assert!(fs::symlink_metadata(old_target).is_err());
    let target = targets.path().join("new-skill");
    let record = &repo.store.get_targets_for_skill(&skill.id).unwrap()[0];
    if record.mode == "symlink" {
        assert_eq!(target.canonicalize().unwrap(), new.canonicalize().unwrap());
    } else {
        // Windows may fall back to a copy when link creation is unavailable.
        assert_eq!(
            skill_metadata::parse_skill_md(&target).name.as_deref(),
            Some("new-skill")
        );
    }
    assert_eq!(
        repo.store
            .get_skill_by_id(&skill.id)
            .unwrap()
            .unwrap()
            .source_ref,
        skill.source_ref
    );
    assert_eq!(
        fs::read_to_string(external.path().join("SKILL.md")).unwrap(),
        "original source"
    );
}

#[test]
fn rename_conflicts_preserve_original_library_and_all_deployments() {
    let repo = test_repo();
    let central = write_skill_dir("old-skill");
    repo.store
        .insert_skill(&sample_skill("skill-id", "old-skill", &central))
        .unwrap();
    let targets = tempdir().unwrap();
    let old_target = deploy(&repo, &central, targets.path(), "codex", "copy");
    let conflict = targets.path().join("new-skill");
    fs::create_dir(&conflict).unwrap();
    fs::write(conflict.join("keep.txt"), "user content").unwrap();

    assert!(rename_skill_internal(&repo.store, "skill-id", "new-skill").is_err());

    assert!(central.exists());
    assert!(old_target.exists());
    assert!(!central_repo::skills_dir().join("new-skill").exists());
    assert_eq!(
        fs::read_to_string(conflict.join("keep.txt")).unwrap(),
        "user content"
    );
    assert_eq!(
        repo.store
            .get_skill_by_id("skill-id")
            .unwrap()
            .unwrap()
            .name,
        "old-skill"
    );
}

#[test]
fn rename_rolls_back_files_and_deployments_when_database_publication_fails() {
    let repo = test_repo();
    let central = write_skill_dir("old-skill");
    repo.store
        .insert_skill(&sample_skill("skill-id", "old-skill", &central))
        .unwrap();
    let targets = tempdir().unwrap();
    let old_target = deploy(&repo, &central, targets.path(), "codex", "copy");
    let conn = rusqlite::Connection::open(central_repo::base_dir().join("test.db")).unwrap();
    conn.execute_batch(
        "CREATE TRIGGER reject_rename BEFORE UPDATE OF name ON skills
        BEGIN SELECT RAISE(ABORT, 'injected rename failure'); END;",
    )
    .unwrap();

    let error = rename_skill_internal(&repo.store, "skill-id", "new-skill").unwrap_err();

    assert!(error.message.contains("injected rename failure"));
    assert_eq!(
        skill_metadata::parse_skill_md(&central).name.as_deref(),
        Some("old-skill")
    );
    assert_eq!(
        skill_metadata::parse_skill_md(&old_target).name.as_deref(),
        Some("old-skill")
    );
    assert!(!central_repo::skills_dir().join("new-skill").exists());
    assert!(!targets.path().join("new-skill").exists());
    assert_eq!(fs::read_dir(targets.path()).unwrap().count(), 1);
    let skill = repo.store.get_skill_by_id("skill-id").unwrap().unwrap();
    assert_eq!(skill.name, "old-skill");
    assert_eq!(skill.central_path, central.to_string_lossy());
}

#[test]
fn rename_preserves_a_directory_that_replaced_a_recorded_link() {
    let repo = test_repo();
    let central = write_skill_dir("old-skill");
    repo.store
        .insert_skill(&sample_skill("skill-id", "old-skill", &central))
        .unwrap();
    let targets = tempdir().unwrap();
    let old_target = deploy(&repo, &central, targets.path(), "codex", "symlink");
    if repo.store.get_targets_for_skill("skill-id").unwrap()[0].mode != "symlink" {
        return; // This host cannot create links; copy deployments are covered separately.
    }
    sync_engine::remove_target(&old_target).unwrap();
    fs::create_dir(&old_target).unwrap();
    fs::write(old_target.join("keep.txt"), "user content").unwrap();

    assert!(rename_skill_internal(&repo.store, "skill-id", "new-skill").is_err());
    assert!(central.exists());
    assert_eq!(
        fs::read_to_string(old_target.join("keep.txt")).unwrap(),
        "user content"
    );
}

#[test]
fn detach_source_keeps_identity_content_and_deployments_without_deleting_source() {
    let repo = test_repo();
    let central = write_skill_dir("old-skill");
    let source = tempdir().unwrap();
    fs::write(source.path().join("SKILL.md"), "source").unwrap();
    let mut skill = sample_skill("skill-id", "old-skill", &central);
    skill.source_ref = Some(source.path().to_string_lossy().into_owned());
    repo.store.insert_skill(&skill).unwrap();
    let targets = tempdir().unwrap();
    let deployed = deploy(&repo, &central, targets.path(), "codex", "copy");

    detach_local_skill_source_internal(&repo.store, &skill.id).unwrap();

    let updated = repo.store.get_skill_by_id(&skill.id).unwrap().unwrap();
    assert!(updated.source_ref.is_none());
    assert_eq!(updated.update_status, "local_only");
    assert_eq!(updated.central_path, skill.central_path);
    assert!(central.join("SKILL.md").exists());
    assert!(deployed.join("SKILL.md").exists());
    assert_eq!(
        fs::read_to_string(source.path().join("SKILL.md")).unwrap(),
        "source"
    );
}

#[test]
fn rename_updates_a_direct_library_target_without_copying_or_removing_the_library() {
    let repo = test_repo();
    let central = write_skill_dir("old-skill");
    repo.store
        .insert_skill(&sample_skill("skill-id", "old-skill", &central))
        .unwrap();
    repo.store
        .insert_target(&SkillTargetRecord {
            id: "direct".into(),
            skill_id: "skill-id".into(),
            tool: "shared".into(),
            target_path: central.to_string_lossy().into_owned(),
            mode: "copy".into(),
            status: "ok".into(),
            synced_at: Some(1),
            last_error: None,
            source_hash: None,
        })
        .unwrap();

    rename_skill_internal(&repo.store, "skill-id", "new-skill").unwrap();

    let new = central_repo::skills_dir().join("new-skill");
    assert_eq!(
        skill_metadata::parse_skill_md(&new).name.as_deref(),
        Some("new-skill")
    );
    assert!(!central.exists());
    assert_eq!(
        repo.store.get_targets_for_skill("skill-id").unwrap()[0].target_path,
        new.to_string_lossy()
    );
}

#[test]
fn rename_quotes_yaml_names_and_refuses_control_characters() {
    let repo = test_repo();
    let central = write_skill_dir("old-skill");
    repo.store
        .insert_skill(&sample_skill("skill-id", "old-skill", &central))
        .unwrap();
    let invalid = rename_skill_internal(&repo.store, "skill-id", "new\nname").unwrap_err();
    assert_eq!(invalid.kind, crate::core::error::ErrorKind::InvalidInput);
    let missing = rename_skill_internal(&repo.store, "missing-id", "valid-name").unwrap_err();
    assert_eq!(missing.kind, crate::core::error::ErrorKind::NotFound);
    assert!(central.exists());

    rename_skill_internal(&repo.store, "skill-id", "New: # skill").unwrap();

    let skill = repo.store.get_skill_by_id("skill-id").unwrap().unwrap();
    assert_eq!(
        skill_metadata::parse_skill_md(Path::new(&skill.central_path))
            .name
            .as_deref(),
        Some("New: # skill")
    );
}

#[test]
fn rename_refuses_an_existing_central_directory_before_touching_deployments() {
    let repo = test_repo();
    let central = write_skill_dir("old-skill");
    let other = write_skill_dir("new-skill");
    repo.store
        .insert_skill(&sample_skill("skill-id", "old-skill", &central))
        .unwrap();
    let targets = tempdir().unwrap();
    let deployed = deploy(&repo, &central, targets.path(), "codex", "copy");

    assert!(rename_skill_internal(&repo.store, "skill-id", "new-skill").is_err());

    assert_eq!(
        skill_metadata::parse_skill_md(&central).name.as_deref(),
        Some("old-skill")
    );
    assert_eq!(
        skill_metadata::parse_skill_md(&deployed).name.as_deref(),
        Some("old-skill")
    );
    assert_eq!(
        skill_metadata::parse_skill_md(&other).name.as_deref(),
        Some("new-skill")
    );
}

#[cfg(unix)]
#[test]
fn rename_keeps_a_source_alias_to_the_library_from_becoming_a_missing_source() {
    let repo = test_repo();
    let central = write_skill_dir("old-skill");
    repo.store
        .insert_skill(&sample_skill("skill-id", "old-skill", &central))
        .unwrap();
    let targets = tempdir().unwrap();
    let alias = deploy(&repo, &central, targets.path(), "codex", "symlink");
    repo.store
        .update_skill_source_ref("skill-id", &alias.to_string_lossy())
        .unwrap();

    rename_skill_internal(&repo.store, "skill-id", "new-skill").unwrap();

    let skill = repo.store.get_skill_by_id("skill-id").unwrap().unwrap();
    assert_eq!(
        skill.source_ref.as_deref(),
        Some(skill.central_path.as_str())
    );
    assert!(!alias.exists());
}
