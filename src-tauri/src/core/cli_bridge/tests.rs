#[cfg(unix)]
use super::*;
#[cfg(unix)]
use tempfile::tempdir;

/// A fake "bundled CLI" that reports the version it is told to. The copy,
/// verify, rename and stamp sequence is what this module owns; which real
/// binary it copies is not.
#[cfg(unix)]
fn fake_cli(dir: &Path, reports: &str) -> PathBuf {
    use std::os::unix::fs::PermissionsExt;
    let path = dir.join("agent-hub-cli");
    std::fs::write(
        &path,
        format!("#!/bin/sh\nif [ \"$2\" = build-info ]; then\n  echo '{}'\nelse\n  echo 'agent-hub-cli {reports}'\nfi\n", build_stamp()),
    )
    .unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
    path
}

#[cfg(unix)]
#[test]
fn publishing_stamps_only_after_the_copy_runs() {
    let _lock = central_repo::test_base_dir_lock();
    let tmp = tempdir().unwrap();
    central_repo::set_test_home_dir_override(Some(tmp.path().to_path_buf()));
    let src_dir = tmp.path().join("bundle");
    std::fs::create_dir_all(&src_dir).unwrap();

    let source = fake_cli(&src_dir, "9.9.9");
    publish_from(&source, "9.9.9").expect("a runnable copy must publish");

    assert!(bridge_path().is_file());
    assert_eq!(read_stamp().as_deref(), Some("9.9.9"));

    central_repo::set_test_home_dir_override(None);
}

#[cfg(unix)]
#[test]
fn same_version_rebuild_replaces_an_older_cli() {
    let _lock = central_repo::test_base_dir_lock();
    let tmp = tempdir().unwrap();
    central_repo::set_test_home_dir_override(Some(tmp.path().to_path_buf()));
    let src_dir = tmp.path().join("bundle");
    std::fs::create_dir_all(&src_dir).unwrap();

    let source = fake_cli(&src_dir, "9.9.9");
    ensure_bridge_from(&source, "9.9.9").unwrap();
    let original = file_digest(&bridge_path()).unwrap();
    let mut rebuilt = std::fs::read_to_string(&source).unwrap();
    rebuilt.push_str("# rebuilt\n");
    std::fs::write(&source, rebuilt).unwrap();
    ensure_bridge_from(&source, "9.9.9").unwrap();

    assert_ne!(file_digest(&bridge_path()).unwrap(), original);
    assert_eq!(
        file_digest(&bridge_path()).unwrap(),
        file_digest(&source).unwrap()
    );
    assert_eq!(read_stamp().as_deref(), Some("9.9.9"));
    central_repo::set_test_home_dir_override(None);
}

/// The publish must abandon rather than proceed when the old bridge cannot
/// be made untrusted — otherwise it would leave a stamp vouching for a
/// binary that is no longer the one the app ships.
///
/// Calls `invalidate_bridge` directly: going through `publish_from` would
/// also fail at the staged copy, and an assertion that cannot tell the two
/// apart proves nothing about the step under test.
#[cfg(unix)]
#[test]
fn a_bridge_that_cannot_be_invalidated_blocks_the_publish() {
    use std::os::unix::fs::PermissionsExt;
    let _lock = central_repo::test_base_dir_lock();
    let tmp = tempdir().unwrap();
    central_repo::set_test_home_dir_override(Some(tmp.path().to_path_buf()));
    let src_dir = tmp.path().join("bundle");
    std::fs::create_dir_all(&src_dir).unwrap();

    publish_from(&fake_cli(&src_dir, "9.9.9"), "9.9.9").unwrap();
    let stamp = bridge_dir().join(".version");

    // Nothing here can be removed (the directory denies writes) and the
    // stamp itself cannot be rewritten, so all three fallbacks are closed.
    std::fs::set_permissions(&stamp, std::fs::Permissions::from_mode(0o400)).unwrap();
    std::fs::set_permissions(bridge_dir(), std::fs::Permissions::from_mode(0o500)).unwrap();

    let result = invalidate_bridge();
    let published_still_there = bridge_path().is_file() && stamp.is_file();

    std::fs::set_permissions(bridge_dir(), std::fs::Permissions::from_mode(0o700)).unwrap();
    std::fs::set_permissions(&stamp, std::fs::Permissions::from_mode(0o600)).unwrap();

    result.expect_err("invalidation must fail when no fallback can take effect");
    assert!(
        published_still_there,
        "precondition: the stale pair is what could not be removed"
    );
    // And the publish that would follow must not run.
    std::fs::set_permissions(bridge_dir(), std::fs::Permissions::from_mode(0o500)).unwrap();
    let publish = publish_from(&fake_cli(&src_dir, "9.9.10"), "9.9.10");
    std::fs::set_permissions(bridge_dir(), std::fs::Permissions::from_mode(0o700)).unwrap();
    publish.expect_err("publishing must abandon rather than leave a lying stamp");

    central_repo::set_test_home_dir_override(None);
}

/// The invariant the stamp exists for: when a replace cannot complete, the
/// binary left behind is not merely old, it may be one that deletes a
/// user's directory where the current one refuses (#363). It must not be
/// reported as usable, and the schema gate cannot catch this because such
/// a fix carries no migration.
#[cfg(unix)]
#[test]
fn a_failed_republish_leaves_the_previous_bridge_unusable() {
    let _lock = central_repo::test_base_dir_lock();
    let tmp = tempdir().unwrap();
    central_repo::set_test_home_dir_override(Some(tmp.path().to_path_buf()));
    let src_dir = tmp.path().join("bundle");
    std::fs::create_dir_all(&src_dir).unwrap();

    publish_from(&fake_cli(&src_dir, "9.9.9"), "9.9.9").unwrap();
    assert_eq!(
        read_stamp().as_deref(),
        Some("9.9.9"),
        "precondition: a good bridge exists"
    );

    // The new app version ships a CLI that cannot run — a truncated copy,
    // a blocked binary, the wrong architecture.
    let broken = src_dir.join("broken-cli");
    std::fs::write(&broken, "not executable").unwrap();
    publish_from(&broken, "9.9.10").expect_err("an unrunnable copy must not publish");

    assert!(
        read_stamp().is_none(),
        "a bridge that failed to republish must be left unstamped, so the \
             skill refuses it even though a binary is still on disk"
    );
    assert!(
        bridge_path().is_file(),
        "the old binary may well be unremovable; the stamp is what gates it"
    );

    central_repo::set_test_home_dir_override(None);
}

#[cfg(unix)]
#[test]
fn native_launch_rejects_a_remaining_binary_after_its_stamp_was_invalidated() {
    let _lock = central_repo::test_base_dir_lock();
    let tmp = tempdir().unwrap();
    central_repo::set_test_home_dir_override(Some(tmp.path().to_path_buf()));
    let outcome = std::panic::catch_unwind(|| {
        std::fs::create_dir_all(bridge_dir()).unwrap();
        fake_cli(&bridge_dir(), env!("CARGO_PKG_VERSION"));
        assert!(validated_path().is_err());
        std::fs::write(stamp_path(), env!("CARGO_PKG_VERSION")).unwrap();
        std::fs::write(
            bridge_dir().join(".build-info.json"),
            serde_json::to_vec(&build_stamp()).unwrap(),
        )
        .unwrap();
        assert_eq!(validated_path().unwrap(), bridge_path());
        std::fs::write(stamp_path(), "").unwrap();
        assert!(validated_path().is_err());
    });
    central_repo::set_test_home_dir_override(None);
    outcome.unwrap();
}

#[cfg(unix)]
#[test]
fn matching_version_does_not_trust_a_different_product_build() {
    let _lock = central_repo::test_base_dir_lock();
    let tmp = tempdir().unwrap();
    central_repo::set_test_home_dir_override(Some(tmp.path().to_path_buf()));
    let outcome = std::panic::catch_unwind(|| {
        std::fs::create_dir_all(bridge_dir()).unwrap();
        fake_cli(&bridge_dir(), env!("CARGO_PKG_VERSION"));
        std::fs::write(stamp_path(), env!("CARGO_PKG_VERSION")).unwrap();
        std::fs::write(
            bridge_dir().join(".build-info.json"),
            r#"{"product_id":"other","config_hash":"other"}"#,
        )
        .unwrap();
        assert!(
            validated_path().is_err(),
            "version equality must not accept another product"
        );
    });
    central_repo::set_test_home_dir_override(None);
    outcome.unwrap();
}

/// A real open writer deterministically produces the Linux spawn error seen in CI.
#[cfg(target_os = "linux")]
#[test]
fn verifies_a_new_cli_after_a_transient_writer_releases_it() {
    let tmp = tempdir().unwrap();
    let source = fake_cli(tmp.path(), "9.9.9");
    let writer = std::fs::OpenOptions::new()
        .write(true)
        .open(&source)
        .unwrap();
    assert_eq!(
        cli_command(&source)
            .arg("--version")
            .output()
            .unwrap_err()
            .raw_os_error(),
        Some(libc::ETXTBSY)
    );
    let release = std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(80));
        drop(writer);
    });
    let verified = verify(&source, "9.9.9");
    release.join().unwrap();
    verified.expect("verification should wait for the transient writer");
}
