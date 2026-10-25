#[test]
fn newer_library_is_not_an_update_even_with_a_stale_cached_status() {
    let repo = test_repo();
    insert_local_skill(
        &repo,
        "newer-library",
        "---\nversion: 0.2.0\n---\nnew",
        "---\nmetadata:\n  version: 0.1.1\n---\nold",
    );
    repo.store
        .update_skill_update_status("newer-library", "update_available")
        .unwrap();
    let dto = managed_skill_by_id(&repo.store, "newer-library").unwrap();
    assert_eq!(dto.update_status, "central_newer");
    let checked =
        check_skill_update_internal_with_remote(&repo.store, "newer-library", true, None).unwrap();
    assert_eq!(checked.update_status, "central_newer");
}

#[test]
fn reimport_never_replaces_a_newer_library_or_its_deployed_copy() {
    let repo = test_repo();
    let newer = "---\nversion: 0.2.0\n---\nnew content\n";
    insert_local_skill(
        &repo,
        "newer-library",
        newer,
        "---\nversion: 0.1.1\n---\nold content\n",
    );
    let target = repo._tmp.path().join("deployed");
    fs::create_dir_all(&target).unwrap();
    fs::write(target.join("SKILL.md"), newer).unwrap();
    repo.store
        .insert_target(&SkillTargetRecord {
            id: "deployed-newer".into(),
            skill_id: "newer-library".into(),
            tool: "codex".into(),
            target_path: target.to_string_lossy().into(),
            mode: "copy".into(),
            status: "ok".into(),
            synced_at: Some(1),
            last_error: None,
            source_hash: None,
        })
        .unwrap();
    let before = repo
        .store
        .get_skill_by_id("newer-library")
        .unwrap()
        .unwrap();
    for approval in [None, Some("stale-removal-approval")] {
        let result = reimport_local_skill_internal(&repo.store, "newer-library", approval).unwrap();
        assert_eq!(result.skill.update_status, "central_newer");
        assert!(result.pending_removals.is_empty());
        assert_eq!(
            fs::read_to_string(Path::new(&before.central_path).join("SKILL.md")).unwrap(),
            newer
        );
        assert_eq!(fs::read_to_string(target.join("SKILL.md")).unwrap(), newer);
        let after = repo
            .store
            .get_skill_by_id("newer-library")
            .unwrap()
            .unwrap();
        assert_eq!(after.content_hash, before.content_hash);
        assert_eq!(after.updated_at, before.updated_at);
    }
}

#[test]
fn newer_source_still_updates_the_library_and_equal_versions_allow_content_edits() {
    let repo = test_repo();
    for (id, central_version, source_version) in [
        ("upgrade", "0.1.1", "0.2.0"),
        ("same-version", "0.2.0", "0.2.0"),
    ] {
        let source = format!("---\nversion: {source_version}\n---\nnew content\n");
        insert_local_skill(
            &repo,
            id,
            &format!("---\nversion: {central_version}\n---\nold content\n"),
            &source,
        );
        let checked = check_skill_update_internal_with_remote(&repo.store, id, true, None).unwrap();
        assert_eq!(checked.update_status, "update_available");
        let result = reimport_local_skill_internal(&repo.store, id, None).unwrap();
        assert_ne!(result.skill.update_status, "central_newer");
        assert_eq!(
            fs::read_to_string(Path::new(&result.skill.central_path).join("SKILL.md")).unwrap(),
            source
        );
    }
}

#[test]
fn git_replacement_guard_keeps_the_newer_library_and_tracks_the_checked_revision() {
    let repo = test_repo();
    insert_local_skill(
        &repo,
        "newer-library",
        "---\nversion: 0.2.0\n---\nnew",
        "---\nversion: 0.1.1\n---\nold",
    );
    let skill = repo
        .store
        .get_skill_by_id("newer-library")
        .unwrap()
        .unwrap();
    let source = Path::new(skill.source_ref.as_deref().unwrap());
    assert!(
        preserve_newer_library(&repo.store, &skill, source, Some("old-version-revision")).unwrap()
    );
    let kept = repo
        .store
        .get_skill_by_id("newer-library")
        .unwrap()
        .unwrap();
    assert_eq!(kept.update_status, "central_newer");
    assert_eq!(
        kept.remote_revision.as_deref(),
        Some("old-version-revision")
    );
    assert_eq!(kept.content_hash, skill.content_hash);
}

#[test]
fn a_newer_source_can_overtake_the_previously_newer_library_without_waiting_for_the_check_ttl() {
    let repo = test_repo();
    insert_local_skill(
        &repo,
        "overtaken",
        "---\nversion: 0.2.0\n---\nlibrary",
        "---\nversion: 0.1.1\n---\nsource",
    );
    check_skill_update_internal_with_remote(&repo.store, "overtaken", true, None).unwrap();
    let before = repo.store.get_skill_by_id("overtaken").unwrap().unwrap();
    assert_eq!(before.update_status, "central_newer");
    let source = Path::new(before.source_ref.as_deref().unwrap());
    fs::write(
        source.join("SKILL.md"),
        "---\nversion: 0.3.0\n---\nnew source",
    )
    .unwrap();
    assert_eq!(
        managed_skill_by_id(&repo.store, "overtaken")
            .unwrap()
            .update_status,
        "update_available"
    );
    let updated = reimport_local_skill_internal(&repo.store, "overtaken", None).unwrap();
    assert_eq!(updated.skill.version.as_deref(), Some("0.3.0"));
}
