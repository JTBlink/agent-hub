use super::*;
use crate::core::{
    central_repo,
    hosts::{read_path, revision},
};

#[test]
fn records_one_device_local_profile_for_identical_contents_and_preserves_it_on_cancel() {
    let _lock = central_repo::test_base_dir_lock();
    let dir = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(dir.path().to_owned()));
    let result = std::panic::catch_unwind(|| {
        let first = super::super::create("First", "127.0.0.1 localhost\n").unwrap();
        let second = super::super::create("Second", &first.content).unwrap();
        let system = dir.path().join("system-hosts");
        fs::write(&system, first.content.replace('\n', "\r\n")).unwrap();
        let snapshot = read_path(&system).unwrap();
        // Old installations have no trustworthy provenance, even for matching files.
        assert_eq!(applied_id(&snapshot).unwrap(), None);
        commit_applied(prepare_applied(Some(&first.id), &snapshot.revision).unwrap()).unwrap();
        assert_eq!(applied_id(&snapshot).unwrap(), Some(first.id.clone()));
        drop(prepare_applied(Some(&second.id), &snapshot.revision).unwrap());
        assert_eq!(applied_id(&snapshot).unwrap(), Some(first.id));
        commit_applied(prepare_applied(Some(&second.id), &snapshot.revision).unwrap()).unwrap();
        // Reading from disk repeatedly (including after a new UI opens) retains the ID.
        for _ in 0..2 {
            assert_eq!(
                applied_id(&read_path(&system).unwrap()).unwrap(),
                Some(second.id.clone())
            );
        }
        assert!(!user_config::root()
            .join("hosts-applied-profile.json")
            .exists());
        commit_applied(prepare_applied(None, &snapshot.revision).unwrap()).unwrap();
        assert_eq!(applied_id(&snapshot).unwrap(), None);
    });
    central_repo::set_test_base_dir_override(None);
    result.unwrap();
}

#[test]
fn rejects_stale_system_contents_and_edited_or_deleted_profiles() {
    let _lock = central_repo::test_base_dir_lock();
    let dir = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(dir.path().to_owned()));
    let result = std::panic::catch_unwind(|| {
        let profile = super::super::create("Original", "127.0.0.1 localhost\n").unwrap();
        let snapshot = HostsSnapshot {
            path: "/etc/hosts".into(),
            content: profile.content.clone(),
            revision: revision(profile.content.as_bytes()),
            backup_warning: None,
            applied_profile_id: None,
        };
        commit_applied(prepare_applied(Some(&profile.id), &snapshot.revision).unwrap()).unwrap();
        let changed = HostsSnapshot {
            revision: "external-change".into(),
            ..snapshot
        };
        assert_eq!(applied_id(&changed).unwrap(), None);
        let snapshot = HostsSnapshot {
            revision: revision(profile.content.as_bytes()),
            ..changed
        };
        let renamed =
            super::super::update(&profile.id, "Renamed", &profile.content, &profile.revision)
                .unwrap();
        assert_eq!(applied_id(&snapshot).unwrap(), Some(profile.id.clone()));
        let edited =
            super::super::update(&profile.id, "Edited", "::1 localhost\n", &renamed.revision)
                .unwrap();
        assert_eq!(applied_id(&snapshot).unwrap(), None);
        super::super::delete(&edited.id, &edited.revision).unwrap();
        assert_eq!(applied_id(&snapshot).unwrap(), None);
    });
    central_repo::set_test_base_dir_override(None);
    result.unwrap();
}
