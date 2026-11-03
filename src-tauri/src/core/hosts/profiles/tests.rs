use super::*;

#[test]
fn saves_complete_profiles_without_changing_identity_and_rejects_stale_edits() {
    let _lock = crate::core::central_repo::test_base_dir_lock();
    let dir = tempfile::tempdir().unwrap();
    crate::core::central_repo::set_test_base_dir_override(Some(dir.path().to_owned()));
    let result = std::panic::catch_unwind(|| {
        let created = create("Development", "127.0.0.1 localhost\n").unwrap();
        assert_eq!(
            std::path::Path::new(&created.path),
            library().join(format!("{}.hosts", created.id))
        );
        assert!(!library().join("profiles").exists());
        let updated = update(&created.id, "Renamed", "::1 localhost\n", &created.revision).unwrap();
        assert_eq!(updated.id, created.id);
        assert_eq!(list().unwrap()[0].name, "Renamed");
        assert_eq!(
            update(&created.id, "Stale", "# stale", &created.revision).unwrap_err(),
            "HOSTS_PROFILE_CONFLICT"
        );
        assert_eq!(
            delete(&created.id, &created.revision).unwrap_err(),
            "HOSTS_PROFILE_CONFLICT"
        );
        delete(&updated.id, &updated.revision).unwrap();
        assert!(list().unwrap().is_empty());
    });
    crate::core::central_repo::set_test_base_dir_override(None);
    result.unwrap();
}

#[test]
fn migrates_legacy_profiles_to_flat_files() {
    let _lock = crate::core::central_repo::test_base_dir_lock();
    let dir = tempfile::tempdir().unwrap();
    crate::core::central_repo::set_test_base_dir_override(Some(dir.path().to_owned()));
    let result = std::panic::catch_unwind(|| {
        let id = uuid::Uuid::new_v4().to_string();
        let legacy = library().join("profiles").join(&id);
        fs::create_dir_all(&legacy).unwrap();
        fs::write(
            legacy.join("profile.json"),
            serde_json::to_vec(&serde_json::json!({
                "schema_version": 1,
                "id": id,
                "name": "Legacy"
            }))
            .unwrap(),
        )
        .unwrap();
        fs::write(legacy.join("hosts"), "127.0.0.1 legacy.test\n").unwrap();
        let profiles = list().unwrap();
        assert_eq!(profiles.len(), 1);
        assert_eq!(
            std::path::PathBuf::from(&profiles[0].path),
            library().join(format!("{id}.hosts"))
        );
        assert!(!library().join("profiles").exists());
        assert_eq!(list().unwrap().len(), 1);
    });
    crate::core::central_repo::set_test_base_dir_override(None);
    result.unwrap();
}

#[test]
fn refuses_traversal_and_preserves_external_edits_and_invalid_drafts() {
    let _lock = crate::core::central_repo::test_base_dir_lock();
    let dir = tempfile::tempdir().unwrap();
    crate::core::central_repo::set_test_base_dir_override(Some(dir.path().to_owned()));
    let result = std::panic::catch_unwind(|| {
        let saved = create("Original", "127.0.0.1 localhost\n").unwrap();
        assert_eq!(
            update("../outside", "Name", "# valid", "stale").unwrap_err(),
            "HOSTS_PROFILE_INVALID_ID"
        );
        assert!(update(&saved.id, "Name", "invalid", &saved.revision)
            .unwrap_err()
            .contains("HOSTS_INVALID_LINE"));
        assert_eq!(list().unwrap()[0].content, saved.content);
        fs::write(&saved.path, "# external edit\n").unwrap();
        assert_eq!(
            update(&saved.id, "Name", "# replacement", &saved.revision).unwrap_err(),
            "HOSTS_PROFILE_CONFLICT"
        );
        assert_eq!(
            apply(&saved.id, &saved.revision, "unused").unwrap_err(),
            "HOSTS_PROFILE_CONFLICT"
        );
        assert_eq!(list().unwrap()[0].content, "# external edit\n");
        assert!(create("  ", "# valid").is_err());
    });
    crate::core::central_repo::set_test_base_dir_override(None);
    result.unwrap();
}

#[cfg(unix)]
#[test]
fn rejects_linked_profile_libraries_before_reading_or_writing() {
    let _lock = crate::core::central_repo::test_base_dir_lock();
    let dir = tempfile::tempdir().unwrap();
    crate::core::central_repo::set_test_base_dir_override(Some(dir.path().join("app")));
    let result = std::panic::catch_unwind(|| {
        fs::create_dir_all(dir.path().join("outside")).unwrap();
        fs::create_dir_all(crate::core::user_config::root()).unwrap();
        std::os::unix::fs::symlink(
            dir.path().join("outside"),
            crate::core::user_config::root().join("hosts"),
        )
        .unwrap();
        assert_eq!(create("Name", "# valid").unwrap_err(), "USER_CONFIG_LINK");
        assert_eq!(list().unwrap_err(), "USER_CONFIG_LINK");
        assert_eq!(fs::read_dir(dir.path().join("outside")).unwrap().count(), 0);
    });
    crate::core::central_repo::set_test_base_dir_override(None);
    result.unwrap();
}

#[test]
fn recovers_the_original_profile_after_an_interrupted_directory_replacement() {
    let _lock = crate::core::central_repo::test_base_dir_lock();
    let dir = tempfile::tempdir().unwrap();
    crate::core::central_repo::set_test_base_dir_override(Some(dir.path().to_owned()));
    let result = std::panic::catch_unwind(|| {
        let original = create("Original", "# original\n").unwrap();
        let previous = format!("hosts-{}", uuid::Uuid::new_v4());
        let recovery = dir.path().join("recovery").join(&previous);
        fs::create_dir_all(recovery.parent().unwrap()).unwrap();
        fs::create_dir_all(&recovery).unwrap();
        fs::rename(
            library().join(format!("{}.hosts", original.id)),
            recovery.join("hosts"),
        )
        .unwrap();
        fs::rename(
            library().join(format!("{}.json", original.id)),
            recovery.join("profile.json"),
        )
        .unwrap();
        fs::create_dir(dir.path().join(".tmp-interrupted")).unwrap();
        fs::write(dir.path().join("hosts-profile-write.json"), serde_json::to_vec(&serde_json::json!({"id":original.id,"staged":".tmp-interrupted","previous":previous})).unwrap()).unwrap();
        let restored = list().unwrap();
        assert_eq!(restored[0].id, original.id);
        assert_eq!(restored[0].content, "# original\n");
        assert!(!dir.path().join("hosts-profile-write.json").exists());
        assert!(!dir.path().join(".tmp-interrupted").exists());
    });
    crate::core::central_repo::set_test_base_dir_override(None);
    result.unwrap();
}

#[test]
fn recovers_an_interrupted_legacy_write_before_migrating() {
    let _lock = crate::core::central_repo::test_base_dir_lock();
    let dir = tempfile::tempdir().unwrap();
    crate::core::central_repo::set_test_base_dir_override(Some(dir.path().to_owned()));
    let result = std::panic::catch_unwind(|| {
        let id = uuid::Uuid::new_v4().to_string();
        let previous = format!("hosts-{}", uuid::Uuid::new_v4());
        let recovery = dir.path().join("recovery").join(&previous);
        fs::create_dir_all(&recovery).unwrap();
        fs::write(
            recovery.join("profile.json"),
            serde_json::to_vec(&serde_json::json!({
                "schema_version": 1,
                "id": id,
                "name": "Legacy"
            }))
            .unwrap(),
        )
        .unwrap();
        fs::write(recovery.join("hosts"), "127.0.0.1 legacy.test\n").unwrap();
        fs::create_dir(dir.path().join(".tmp-interrupted")).unwrap();
        fs::write(
            dir.path().join("hosts-profile-write.json"),
            serde_json::to_vec(&serde_json::json!({
                "id": id,
                "staged": ".tmp-interrupted",
                "previous": previous
            }))
            .unwrap(),
        )
        .unwrap();
        let restored = list().unwrap();
        assert_eq!(restored[0].id, id);
        assert_eq!(restored[0].content, "127.0.0.1 legacy.test\n");
        assert_eq!(
            std::path::PathBuf::from(&restored[0].path),
            library().join(format!("{id}.hosts"))
        );
        assert!(!library().join("profiles").exists());
        assert_eq!(list().unwrap().len(), 1);
    });
    crate::core::central_repo::set_test_base_dir_override(None);
    result.unwrap();
}

#[test]
fn refuses_writes_that_would_exceed_shared_configuration_capacity() {
    let _lock = crate::core::central_repo::test_base_dir_lock();
    let dir = tempfile::tempdir().unwrap();
    crate::core::central_repo::set_test_base_dir_override(Some(dir.path().to_owned()));
    let result = std::panic::catch_unwind(|| {
        let original = create("Original", "# original\n").unwrap();
        let root = crate::core::user_config::root();
        for index in 0..31 {
            fs::write(root.join(format!("other-{index}")), vec![b'#'; 1024 * 1024]).unwrap();
        }
        let large = "#".repeat(1024 * 1024);
        assert_eq!(
            create("Too large", &large).unwrap_err(),
            "USER_CONFIG_TOO_LARGE"
        );
        assert_eq!(
            update(&original.id, "Too large", &large, &original.revision).unwrap_err(),
            "USER_CONFIG_TOO_LARGE"
        );
        assert_eq!(list().unwrap()[0].content, "# original\n");
        crate::core::user_config::validate_tree(&root).unwrap();
    });
    crate::core::central_repo::set_test_base_dir_override(None);
    result.unwrap();
}

#[test]
fn flattens_direct_directories_without_changing_revisions_and_preserves_conflicts() {
    let _lock = crate::core::central_repo::test_base_dir_lock();
    let dir = tempfile::tempdir().unwrap();
    crate::core::central_repo::set_test_base_dir_override(Some(dir.path().to_owned()));
    let result = std::panic::catch_unwind(|| {
        let original = create("Original", "# original\r\n").unwrap();
        let legacy = library().join(&original.id);
        fs::create_dir(&legacy).unwrap();
        fs::rename(&original.path, legacy.join("hosts")).unwrap();
        fs::rename(
            library().join(format!("{}.json", original.id)),
            legacy.join("profile.json"),
        )
        .unwrap();
        fs::write(legacy.join("notes.txt"), "# external notes").unwrap();
        assert_eq!(list().unwrap_err(), "HOSTS_PROFILE_CONFLICT");
        assert!(legacy.join("notes.txt").exists());
        fs::remove_file(legacy.join("notes.txt")).unwrap();
        let migrated = list().unwrap().remove(0);
        assert_eq!(migrated.id, original.id);
        assert_eq!(migrated.revision, original.revision);
        assert_eq!(migrated.content, original.content);
        assert_eq!(migrated.path, original.path);
        assert!(!legacy.exists());

        fs::create_dir(&legacy).unwrap();
        fs::copy(
            library().join(format!("{}.json", original.id)),
            legacy.join("profile.json"),
        )
        .unwrap();
        fs::write(legacy.join("hosts"), "# conflicting copy\n").unwrap();
        assert_eq!(list().unwrap_err(), "HOSTS_PROFILE_CONFLICT");
        assert_eq!(
            fs::read_to_string(&original.path).unwrap(),
            original.content
        );
        assert_eq!(
            fs::read_to_string(legacy.join("hosts")).unwrap(),
            "# conflicting copy\n"
        );
    });
    crate::core::central_repo::set_test_base_dir_override(None);
    result.unwrap();
}

#[cfg(unix)]
#[test]
fn rejects_links_in_either_flat_profile_file() {
    let _lock = crate::core::central_repo::test_base_dir_lock();
    let dir = tempfile::tempdir().unwrap();
    crate::core::central_repo::set_test_base_dir_override(Some(dir.path().to_owned()));
    let result = std::panic::catch_unwind(|| {
        for extension in ["hosts", "json"] {
            let original = create("Original", "# original\n").unwrap();
            let target = library().join(format!("{}.{extension}", original.id));
            let outside = dir.path().join("outside");
            fs::rename(&target, &outside).unwrap();
            std::os::unix::fs::symlink(&outside, &target).unwrap();
            assert_eq!(list().unwrap_err(), "USER_CONFIG_LINK");
            assert_eq!(
                delete(&original.id, &original.revision).unwrap_err(),
                "USER_CONFIG_LINK"
            );
            fs::remove_file(&target).unwrap();
            fs::rename(&outside, target).unwrap();
            delete(&original.id, &original.revision).unwrap();
        }
    });
    crate::core::central_repo::set_test_base_dir_override(None);
    result.unwrap();
}
