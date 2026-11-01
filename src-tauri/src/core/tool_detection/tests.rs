use super::*;
use std::fs;

fn probe(root: &Path) -> InstallationProbe {
    InstallationProbe {
        bins: vec![root.join("bin")],
        apps: vec![root.join("apps")],
        extension_hosts: vec![(true, root.join("extensions"))],
    }
}
fn write_executable(path: &Path) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, "fixture").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
    }
}
#[test]
fn settings_and_skills_are_not_installation_evidence() {
    let tmp = tempfile::tempdir().unwrap();
    fs::create_dir_all(tmp.path().join(".claude/skills/demo")).unwrap();
    fs::write(tmp.path().join(".claude/settings.json"), "{}").unwrap();
    fs::create_dir_all(tmp.path().join("bin/claude")).unwrap();
    assert!(!probe(tmp.path()).installed("claude_code"));
}
#[test]
fn executable_alias_is_required_and_detected() {
    let tmp = tempfile::tempdir().unwrap();
    let cli = tmp.path().join(if cfg!(windows) {
        "bin/claude.cmd"
    } else {
        "bin/claude"
    });
    write_executable(&cli);
    assert!(probe(tmp.path()).installed("claude_code"));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(cli, fs::Permissions::from_mode(0o644)).unwrap();
        assert!(!probe(tmp.path()).installed("claude_code"));
    }
    assert!(!probe(tmp.path()).installed("../claude"));
}
#[test]
fn extension_requires_installed_host_identity_and_entrypoint_and_not_obsolete() {
    let tmp = tempfile::tempdir().unwrap();
    let mut probe = probe(tmp.path());
    let extension = tmp.path().join("extensions/copilot-fixture");
    fs::create_dir_all(&extension).unwrap();
    fs::write(
        extension.join("package.json"),
        r#"{"publisher":"GitHub","name":"copilot","main":"dist/extension.js"}"#,
    )
    .unwrap();
    assert!(!probe.installed("github_copilot"));
    fs::create_dir_all(extension.join("dist")).unwrap();
    fs::write(extension.join("dist/extension.js"), "fixture").unwrap();
    assert!(probe.installed("github_copilot"));
    probe.extension_hosts[0].0 = false;
    assert!(!probe.installed("github_copilot"));
    probe.extension_hosts[0].0 = true;
    fs::write(
        tmp.path().join("extensions/.obsolete"),
        r#"{"copilot-fixture":true}"#,
    )
    .unwrap();
    assert!(!probe.installed("github_copilot"));
}
#[cfg(target_os = "macos")]
#[test]
fn desktop_bundle_needs_metadata_and_executable() {
    let tmp = tempfile::tempdir().unwrap();
    let bundle = tmp.path().join("apps/Cursor.app/Contents");
    fs::create_dir_all(&bundle).unwrap();
    fs::write(bundle.join("Info.plist"), "fixture").unwrap();
    assert!(!probe(tmp.path()).installed("cursor"));
    write_executable(&bundle.join("MacOS/Cursor"));
    assert!(probe(tmp.path()).installed("cursor"));
}
