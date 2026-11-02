use super::*;

#[cfg(target_os = "macos")]
#[test]
fn opens_the_supported_privacy_pane_for_each_macos_settings_generation() {
    assert_eq!(
        permissions::macos_settings_url(12),
        "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
    );
    for major in [13, 15, 26] {
        assert_eq!(permissions::macos_settings_url(major), "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles");
    }
}

#[test]
fn accepts_ipv4_ipv6_aliases_comments_and_disabled_entries() {
    validate("# disabled mapping\n127.0.0.1 localhost demo.test # local\n::1 localhost\n").unwrap();
    for invalid in [
        "999.1.2.3 demo.test",
        "127.0.0.1",
        "::1 bad/name",
        "127.0.0.1 $(touch)",
    ] {
        assert_eq!(validate(invalid).unwrap_err(), "HOSTS_INVALID_LINE:1");
    }
    assert_eq!(
        validate("# ok\ninvalid name").unwrap_err(),
        "HOSTS_INVALID_LINE:2"
    );
    assert_eq!(
        validate(&"#".repeat(MAX_BYTES + 1)).unwrap_err(),
        "HOSTS_TOO_LARGE"
    );
}

#[test]
fn preserves_windows_line_endings_and_utf8_bom() {
    assert_eq!(
        encode("127.0.0.1 localhost\n::1 localhost\n", "\u{feff}# old\r\n"),
        "\u{feff}127.0.0.1 localhost\r\n::1 localhost\r\n"
    );
}

#[test]
fn refuses_concurrent_edits_and_invalid_content_without_touching_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("hosts");
    std::fs::write(&path, "127.0.0.1 localhost\n").unwrap();
    let before = read_path(&path).unwrap();
    assert!(save_path(&path, "invalid", &before.revision)
        .unwrap_err()
        .contains("HOSTS_INVALID_LINE"));
    std::fs::write(&path, "::1 localhost\n").unwrap();
    assert_eq!(
        save_path(&path, "127.0.0.1 demo.test", &before.revision).unwrap_err(),
        "HOSTS_CONFLICT"
    );
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "::1 localhost\n");
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
}

#[test]
fn saves_with_exact_backup_and_skips_unchanged_content() {
    let dir = tempfile::Builder::new()
        .prefix("hosts ' quoted ")
        .tempdir()
        .unwrap();
    let path = dir.path().join("hosts");
    let original = "# original\r\n127.0.0.1 localhost\r\n";
    std::fs::write(&path, original).unwrap();
    let before = read_path(&path).unwrap();
    assert!(save_path(&path, original, &before.revision)
        .unwrap()
        .backup_path
        .is_none());
    let next = "# $(echo never-executed)\n::1 localhost demo.test\n";
    let result = save_path(&path, next, &before.revision).unwrap();
    assert_eq!(
        std::fs::read(result.backup_path.unwrap()).unwrap(),
        original.as_bytes()
    );
    assert_eq!(result.snapshot.content, next.replace('\n', "\r\n"));
    assert_eq!(read_path(&path).unwrap().revision, result.snapshot.revision);
}

#[cfg(unix)]
#[test]
fn refuses_symbolic_link_targets_and_keeps_permissions() {
    use std::os::unix::fs::{symlink, PermissionsExt};
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("hosts");
    std::fs::write(&path, "127.0.0.1 localhost\n").unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o640)).unwrap();
    let link = dir.path().join("link");
    symlink(&path, &link).unwrap();
    let before = read_path(&path).unwrap();
    assert_eq!(
        save_path(&link, "::1 localhost\n", &before.revision).unwrap_err(),
        "HOSTS_INVALID_TARGET"
    );
    save_path(&path, "::1 localhost\n", &before.revision).unwrap();
    assert_eq!(
        std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
        0o640
    );
}

#[cfg(unix)]
#[test]
fn helper_rechecks_original_and_payload_after_authorization() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("hosts");
    let source = dir.path().join("payload");
    let backup = dir.path().join("backup");
    std::fs::write(&path, "127.0.0.1 localhost\n").unwrap();
    std::fs::write(&source, "::1 localhost\n").unwrap();
    let before = read_path(&path).unwrap();
    let next = revision(&std::fs::read(&source).unwrap());
    let script = elevation::script(&path, &source, &before.revision, &next, &backup);
    std::fs::write(&path, "# external edit\n").unwrap();
    let result = crate::core::cli_process::command("/bin/sh", &["-c", &script], &[]).unwrap_err();
    assert!(result.contains("HOSTS_CONFLICT"));
    assert!(!backup.exists());
    std::fs::write(&path, &before.content).unwrap();
    std::fs::write(&source, "# modified payload\n").unwrap();
    let result = crate::core::cli_process::command("/bin/sh", &["-c", &script], &[]).unwrap_err();
    assert!(result.contains("HOSTS_PAYLOAD_CHANGED"));
    assert!(!backup.exists());
    assert_eq!(std::fs::read_to_string(path).unwrap(), before.content);
}
