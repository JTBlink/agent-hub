use super::*;
#[test]
fn persists_rotations_and_logout_across_cache_instances() {
    let _lock = central_repo::test_base_dir_lock();
    let temp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(temp.path().join("app")));
    assert!(read("example.invalid").unwrap().is_none());
    for password in ["fixture-one", "fixture-two"] {
        let cred = RemoteCredential {
            username: "fixture".into(),
            password: password.into(),
        };
        write("EXAMPLE.INVALID", Some(&cred)).unwrap();
        assert_eq!(read("example.invalid").unwrap(), Some(Some(cred)));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(directory()).unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(
            fs::metadata(path("example.invalid"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
    write("example.invalid", None).unwrap();
    assert_eq!(read("example.invalid").unwrap(), Some(None));
    central_repo::set_test_base_dir_override(None);
}

#[cfg(unix)]
#[test]
fn rejects_linked_credential_directory_without_touching_target() {
    let _lock = central_repo::test_base_dir_lock();
    let temp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(temp.path().to_owned()));
    let target = temp.path().join("outside");
    fs::create_dir(&target).unwrap();
    std::os::unix::fs::symlink(&target, directory()).unwrap();
    assert!(write("example.invalid", None).is_err());
    assert!(read("example.invalid").is_err());
    assert_eq!(fs::read_dir(target).unwrap().count(), 0);
    central_repo::set_test_base_dir_override(None);
}
