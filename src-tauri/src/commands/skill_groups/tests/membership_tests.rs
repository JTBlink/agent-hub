use super::*;

#[test]
fn membership_edit_leaves_unrelated_metadata_untouched() {
    let repo = metadata_test_repo();
    repo.store
        .insert_scenario(&sample_scenario("group", "Group"))
        .unwrap();
    for index in 0..128 {
        let id = format!("skill-{index}");
        let dir = write_skill_dir(&crate::core::central_repo::skills_dir(), &id);
        repo.store
            .insert_skill(&sample_skill(&id, &id, &dir))
            .unwrap();
    }
    sync_metadata::write_all_from_db_unlocked(&repo.store).unwrap();
    let unrelated = sync_metadata::metadata_dir().join("skills/skill-127.json");
    // Valid noncanonical JSON reveals whether an unrelated record is exported again.
    let before = format!("{}\n", fs::read_to_string(&unrelated).unwrap());
    fs::write(&unrelated, &before).unwrap();
    let start = Instant::now();
    for index in 0..20 {
        set_skill_group_skills_internal(&repo.store, "group", &[format!("skill-{index}")], true)
            .unwrap();
    }
    eprintln!(
        "membership baseline: 128 library skills, 20 additions: {:?}",
        start.elapsed()
    );
    assert_eq!(repo.store.count_skills_for_scenario("group").unwrap(), 20);
    repo.store
        .insert_scenario(&sample_scenario("batch", "Batch"))
        .unwrap();
    let ids: Vec<String> = (0..20).map(|index| format!("skill-{index}")).collect();
    let start = Instant::now();
    set_skill_group_skills_internal(&repo.store, "batch", &ids, true).unwrap();
    eprintln!(
        "membership batch: 128 library skills, 20 additions: {:?}",
        start.elapsed()
    );
    assert_eq!(repo.store.count_skills_for_scenario("batch").unwrap(), 20);
    assert_eq!(
        repo.store.count_skills_for_scenario("group").unwrap(),
        0,
        "exclusive move should empty the source group"
    );
    assert_eq!(
        fs::read_to_string(unrelated).unwrap(),
        before,
        "membership edits must not re-export unrelated skill records"
    );
    assert!(repo.store.get_all_targets().unwrap().is_empty());
}

#[test]
fn membership_batch_is_atomic_when_a_skill_disappears() {
    let repo = metadata_test_repo();
    repo.store
        .insert_scenario(&sample_scenario("group", "Group"))
        .unwrap();
    let dir = write_skill_dir(&crate::core::central_repo::skills_dir(), "valid");
    repo.store
        .insert_skill(&sample_skill("valid", "valid", &dir))
        .unwrap();
    let ids = vec!["valid".to_string(), "missing".to_string()];
    assert!(set_skill_group_skills_internal(&repo.store, "group", &ids, true).is_err());
    assert_eq!(repo.store.count_skills_for_scenario("group").unwrap(), 0);
    set_skill_group_skills_internal(&repo.store, "group", &["valid".into()], true).unwrap();
    assert!(set_skill_group_skills_internal(&repo.store, "group", &ids, false).is_err());
    assert_eq!(repo.store.count_skills_for_scenario("group").unwrap(), 1);
}

#[test]
fn membership_add_remove_roundtrip_exclusive_move_and_tools() {
    let repo = metadata_test_repo();
    for group in ["edited", "other"] {
        repo.store
            .insert_scenario(&sample_scenario(group, group))
            .unwrap();
    }
    for id in ["a", "b", "c"] {
        let dir = write_skill_dir(&crate::core::central_repo::skills_dir(), id);
        repo.store
            .insert_skill(&sample_skill(id, id, &dir))
            .unwrap();
    }
    repo.store.set_active_scenario("other").unwrap();
    repo.store.add_skill_to_scenario("other", "a").unwrap();
    // Adding a, b, c to "edited" should exclusively move "a" out of "other".
    let displaced = set_skill_group_skills_internal(
        &repo.store,
        "edited",
        &["a".into(), "b".into(), "c".into()],
        true,
    )
    .unwrap();
    assert_eq!(displaced, vec!["other"], "a should be displaced from other");
    assert!(sync_metadata::metadata_dir()
        .join("skills/c.json")
        .is_file());
    // "a" is no longer in "other".
    assert!(
        repo.store
            .get_skill_ids_for_scenario("other")
            .unwrap()
            .is_empty(),
        "exclusive move should remove a from other"
    );
    repo.store
        .reorder_scenario_skills("edited", &["c".into(), "b".into(), "a".into()])
        .unwrap();
    repo.store
        .set_scenario_skill_tool_enabled("edited", "c", "test-agent", false)
        .unwrap();
    sync_metadata::write_all_from_db_unlocked(&repo.store).unwrap();

    set_skill_group_skills_internal(&repo.store, "edited", &["b".into()], false).unwrap();
    assert!(!sync_metadata::metadata_dir()
        .join("scenario-skills/edited/b.json")
        .exists());
    sync_metadata::reindex_from_metadata_unlocked(&repo.store).unwrap();
    assert_eq!(
        repo.store.get_skill_ids_for_scenario("edited").unwrap(),
        vec!["c", "a"]
    );
    let toggles = repo
        .store
        .get_scenario_skill_tool_toggles("edited", "c")
        .unwrap();
    assert_eq!(toggles.len(), 1);
    assert!(!toggles[0].enabled);
    assert_eq!(
        repo.store.get_active_scenario_id().unwrap().as_deref(),
        Some("other")
    );
    assert!(repo.store.get_all_targets().unwrap().is_empty());

    set_skill_group_skills_internal(&repo.store, "edited", &["c".into(), "a".into()], false)
        .unwrap();
    sync_metadata::reindex_from_metadata_unlocked(&repo.store).unwrap();
    assert!(repo
        .store
        .get_skill_ids_for_scenario("edited")
        .unwrap()
        .is_empty());
    assert_eq!(repo.store.get_all_skills().unwrap().len(), 3);
}
