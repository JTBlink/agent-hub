use super::*;
use crate::core::skill_store::ScenarioRecord;

#[test]
fn overwrite_replaces_contents_in_place_and_preserves_identity_groups_tags_and_deployments() {
    let repo = test_repo();
    let central = write_skill_dir("demo");
    fs::write(central.join("obsolete.txt"), "old").unwrap();
    let mut existing = sample_skill("existing", "demo", &central);
    existing.enabled = false;
    repo.store.insert_skill(&existing).unwrap();
    repo.store
        .set_tags_for_skill("existing", &["team".to_string()])
        .unwrap();
    repo.store
        .insert_scenario(&ScenarioRecord {
            id: "group".to_string(),
            name: "Group".to_string(),
            description: None,
            icon: None,
            sort_order: 0,
            created_at: 1,
            updated_at: 1,
        })
        .unwrap();
    repo.store
        .add_skill_to_scenario("group", "existing")
        .unwrap();
    let deployment = tempdir().unwrap();
    let target = deployment.path().join("demo");
    fs::create_dir_all(&target).unwrap();
    fs::write(target.join("SKILL.md"), "old").unwrap();
    fs::write(target.join("obsolete.txt"), "old").unwrap();
    repo.store
        .insert_target(&SkillTargetRecord {
            id: "target".to_string(),
            skill_id: "existing".to_string(),
            tool: "codex".to_string(),
            target_path: target.to_string_lossy().to_string(),
            mode: "copy".to_string(),
            status: "ok".to_string(),
            synced_at: Some(1),
            last_error: None,
            source_hash: None,
        })
        .unwrap();
    let source = tempdir().unwrap();
    fs::write(
        source.path().join("SKILL.md"),
        "---\nname: demo\ndescription: New version\n---\nnew",
    )
    .unwrap();
    fs::write(source.path().join("new.txt"), "new content").unwrap();

    repository_install::overwrite_local_skill(&repo.store, "existing", source.path()).unwrap();

    let updated = repo.store.get_skill_by_id("existing").unwrap().unwrap();
    assert_eq!(repo.store.get_all_skills().unwrap().len(), 1);
    assert_eq!(updated.central_path, existing.central_path);
    assert_eq!(updated.created_at, existing.created_at);
    assert!(!updated.enabled);
    assert_eq!(updated.source_type, "local");
    assert_eq!(updated.source_ref.as_deref(), source.path().to_str());
    assert_eq!(
        repo.store.get_scenarios_for_skill("existing").unwrap(),
        vec!["group"]
    );
    assert_eq!(repo.store.get_tags_map().unwrap()["existing"], vec!["team"]);
    assert_eq!(
        fs::read_to_string(central.join("new.txt")).unwrap(),
        "new content"
    );
    assert!(!central.join("obsolete.txt").exists());
    assert!(!central_repo::skills_dir().join("demo-2").exists());
    assert_eq!(
        repo.store.get_targets_for_skill("existing").unwrap().len(),
        1
    );
    assert_eq!(
        fs::read_to_string(target.join("new.txt")).unwrap(),
        "new content"
    );
    assert!(!target.join("obsolete.txt").exists());
}

#[test]
fn overwrite_failure_keeps_existing_content_and_does_not_leave_a_staged_skill() {
    let repo = test_repo();
    let central = write_skill_dir("demo");
    repo.store
        .insert_skill(&sample_skill("existing", "demo", &central))
        .unwrap();
    let original = fs::read(central.join("SKILL.md")).unwrap();
    let invalid = tempdir().unwrap();
    assert!(
        repository_install::overwrite_local_skill(&repo.store, "existing", invalid.path()).is_err()
    );
    assert_eq!(fs::read(central.join("SKILL.md")).unwrap(), original);
    assert_eq!(fs::read_dir(central_repo::skills_dir()).unwrap().count(), 1);
    assert_eq!(
        repo.store
            .get_skill_by_id("existing")
            .unwrap()
            .unwrap()
            .source_type,
        "import"
    );
    assert!(
        repository_install::overwrite_local_skill(&repo.store, "removed", invalid.path()).is_err()
    );
    assert_eq!(repo.store.get_all_skills().unwrap().len(), 1);
}

#[test]
fn overwrite_refuses_external_registered_content_and_overlapping_local_sources() {
    let repo = test_repo();
    let external = tempdir().unwrap();
    fs::write(
        external.path().join("SKILL.md"),
        "---\nname: external\n---\nold",
    )
    .unwrap();
    repo.store
        .insert_skill(&sample_skill("external", "external", external.path()))
        .unwrap();
    let central = write_skill_dir("demo");
    repo.store
        .insert_skill(&sample_skill("existing", "demo", &central))
        .unwrap();
    let nested = central.join("nested");
    fs::create_dir(&nested).unwrap();
    fs::write(nested.join("SKILL.md"), "---\nname: nested\n---\n").unwrap();
    assert!(repository_install::overwrite_local_skill(&repo.store, "external", &central).is_err());
    assert!(repository_install::overwrite_local_skill(&repo.store, "existing", &nested).is_err());
    assert!(external.path().join("SKILL.md").exists());
    assert!(nested.join("SKILL.md").exists());
}

#[test]
fn remote_overwrite_updates_provenance_without_allocating_a_duplicate() {
    let repo = test_repo();
    let central = write_skill_dir("demo");
    repo.store
        .insert_skill(&sample_skill("existing", "demo", &central))
        .unwrap();
    let source = tempdir().unwrap();
    fs::write(
        source.path().join("SKILL.md"),
        "---\nname: demo\n---\nremote",
    )
    .unwrap();
    let metadata = InstallSourceMetadata {
        source_type: "git".to_string(),
        source_ref: Some("https://git.example.invalid/team/skills.git".to_string()),
        source_ref_resolved: Some("https://git.example.invalid/team/skills.git".to_string()),
        source_subpath: Some("skills/demo".to_string()),
        source_branch: Some("main".to_string()),
        source_revision: Some("revision".to_string()),
        source_agent: None,
        remote_revision: Some("revision".to_string()),
        update_status: "up_to_date".to_string(),
    };
    repository_install::overwrite_skill_unlocked(&repo.store, "existing", source.path(), &metadata)
        .unwrap();
    let skill = repo.store.get_skill_by_id("existing").unwrap().unwrap();
    assert_eq!(skill.source_type, "git");
    assert_eq!(skill.source_subpath.as_deref(), Some("skills/demo"));
    assert_eq!(skill.source_revision.as_deref(), Some("revision"));
    assert_eq!(repo.store.get_all_skills().unwrap().len(), 1);
    let item = |id: Option<&str>| SkillInstallItem {
        rel_path: "demo".to_string(),
        name: "demo".to_string(),
        overwrite_skill_id: id.map(str::to_string),
    };
    assert!(repository_install::validate_overwrite_targets(&[
        item(Some("existing")),
        item(Some("existing"))
    ])
    .is_err());
    assert!(
        repository_install::validate_overwrite_targets(&[item(None), item(Some("existing"))])
            .is_ok()
    );
    assert!(
        serde_json::from_str::<SkillInstallItem>(r#"{"rel_path":"demo","name":"demo"}"#)
            .unwrap()
            .overwrite_skill_id
            .is_none()
    );
}
