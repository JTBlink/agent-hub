use super::*;

#[test]
fn stores_current_and_previous_contents_without_portable_system_paths_or_device_keys() {
    let _lock = central_repo::test_base_dir_lock();
    let dir = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(dir.path().to_owned()));
    let result = std::panic::catch_unwind(|| {
        let before = crate::core::hosts::HostsSnapshot {
            path: "/etc/hosts".into(),
            content: "# before\n".into(),
            revision: "old".into(),
            backup_warning: None,
            applied_profile_id: None,
        };
        capture(&before, false).unwrap();
        capture(&before, true).unwrap();
        capture(
            &crate::core::hosts::HostsSnapshot {
                content: "# after\n".into(),
                ..before
            },
            false,
        )
        .unwrap();
        let id = device_id().unwrap();
        let root = user_config::root().join("hosts/systems").join(&id);
        assert_eq!(
            fs::read_to_string(root.join("current.hosts")).unwrap(),
            "# after\n"
        );
        assert_eq!(
            fs::read_to_string(root.join("previous.hosts")).unwrap(),
            "# before\n"
        );
        assert_eq!(device_id().unwrap(), id);
        assert!(!user_config::root().join("hosts-device-id").exists());
    });
    central_repo::set_test_base_dir_override(None);
    result.unwrap();
}
