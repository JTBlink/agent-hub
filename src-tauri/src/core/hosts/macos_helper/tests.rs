use super::*;
use std::io::Write;

fn request(script: &str, expected: &str, content: &str, token: &str) -> Result<(), String> {
    let mut input = tempfile::tempfile().unwrap();
    writeln!(
        input,
        "{expected}\n{}\n{token}",
        super::super::revision(content.as_bytes())
    )
    .unwrap();
    input.write_all(content.as_bytes()).unwrap();
    input.rewind().unwrap();
    let mut command = Command::new("/bin/bash");
    command.args(["-c", script]);
    cli_process::capture_prepared_with_input(command, "fixture", 5, None, Some(input)).map(|_| ())
}

#[test]
fn fixed_writer_preserves_backups_rejects_conflicts_and_treats_input_as_data() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().to_str().unwrap();
    let script = WRITER.replace("/private/etc", path);
    let target = dir.path().join("hosts");
    let original = "127.0.0.1 localhost\n";
    std::fs::write(&target, original).unwrap();
    let revision = super::super::revision(original.as_bytes());
    let token = "11111111-1111-4111-8111-111111111111";
    let content = "# $(/bin/echo never-executed)\n::1 localhost\n";
    request(&script, &revision, content, token).unwrap();
    assert_eq!(std::fs::read_to_string(&target).unwrap(), content);
    assert_eq!(
        std::fs::read_to_string(dir.path().join(format!("hosts.agent-hub-{token}.bak"))).unwrap(),
        original
    );
    assert!(request(&script, &revision, "# concurrent edit\n", token)
        .unwrap_err()
        .contains("HOSTS_CONFLICT"));
    assert!(request(&script, &revision, content, "../../escape").is_err());
    assert_eq!(std::fs::read_to_string(&target).unwrap(), content);
    assert!(!dir.path().join("agent-hub-hosts.lock").exists());
}

#[test]
fn fixed_writer_rejects_payload_tampering_oversize_and_symbolic_links() {
    let dir = tempfile::tempdir().unwrap();
    let script = WRITER.replace("/private/etc", dir.path().to_str().unwrap());
    let target = dir.path().join("hosts");
    let original = "127.0.0.1 localhost\n";
    std::fs::write(&target, original).unwrap();
    let revision = super::super::revision(original.as_bytes());
    let token = "11111111-1111-4111-8111-111111111111";
    let tampered = script.replace("digest \"$temporary/content\"", "digest \"$target\"");
    assert!(request(&tampered, &revision, "::1 localhost\n", token)
        .unwrap_err()
        .contains("HOSTS_PAYLOAD_CHANGED"));
    assert!(
        request(&script, &revision, &"#".repeat(1024 * 1024 + 1), token)
            .unwrap_err()
            .contains("HOSTS_TOO_LARGE")
    );
    let backup = dir.path().join(format!("hosts.agent-hub-{token}.bak"));
    std::os::unix::fs::symlink(&target, backup).unwrap();
    assert!(request(&script, &revision, "::1 localhost\n", token).is_err());
    assert_eq!(std::fs::read_to_string(&target).unwrap(), original);
    std::fs::remove_file(&target).unwrap();
    std::os::unix::fs::symlink(dir.path().join("other"), target).unwrap();
    assert!(request(&script, &revision, "::1 localhost\n", token)
        .unwrap_err()
        .contains("HOSTS_INVALID_TARGET"));
}

#[test]
fn installer_has_valid_shell_and_limits_sudo_to_argument_free_entry() {
    let policy = rule("demo");
    assert_eq!(
        policy,
        format!("demo ALL=(root) NOPASSWD: {ROOT}/run \"\"\n")
    );
    let mut policy_file = tempfile::NamedTempFile::new().unwrap();
    policy_file.write_all(policy.as_bytes()).unwrap();
    cli_process::command(
        "/usr/sbin/visudo",
        &["-cf", policy_file.path().to_str().unwrap()],
        &[],
    )
    .unwrap();
    let mut command = Command::new("/bin/bash");
    command.args([
        "-n",
        "-c",
        &install_script("/private/etc/sudoers.d/agent-hub-hosts-999", &policy),
    ]);
    cli_process::capture_prepared(command, "syntax", 5, None).unwrap();
}

#[test]
fn fixed_writer_restores_original_when_post_write_verification_fails() {
    let dir = tempfile::tempdir().unwrap();
    let script = WRITER
        .replace("/private/etc", dir.path().to_str().unwrap())
        .replace(r#"[[ "$(digest "$target")" != "$updated" ]]"#, "true");
    let target = dir.path().join("hosts");
    let original = "127.0.0.1 localhost\n";
    std::fs::write(&target, original).unwrap();
    let error = request(
        &script,
        &super::super::revision(original.as_bytes()),
        "::1 localhost\n",
        "11111111-1111-4111-8111-111111111111",
    )
    .unwrap_err();
    assert!(error.contains("HOSTS_WRITE_FAILED"));
    assert_eq!(std::fs::read_to_string(target).unwrap(), original);
    assert!(!dir.path().join("agent-hub-hosts.lock").exists());
}
