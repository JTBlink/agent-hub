use super::*;
use std::process::Command;

fn snapshot(path: PathBuf) -> Snapshot {
    let value = json!({"Label":"org.example.audit", "ProgramArguments":["/usr/bin/true"], "StartCalendarInterval":{"Hour":7,"Minute":0}, "RunAtLoad":true, "StandardOutPath":"/workspace/audit.log"});
    let mut bytes = Vec::new();
    plist::to_writer_xml(&mut bytes, &value).unwrap();
    Snapshot {
        path,
        bytes,
        value,
        label: "org.example.audit".into(),
        domain: "system".into(),
        loaded: true,
        enabled: true,
        requires_admin: true,
    }
}

#[test]
fn elevated_scripts_are_scoped_recheck_revisions_and_keep_payloads_out_of_the_command() {
    let task = snapshot("/Library/LaunchDaemons/audit.plist".into());
    let script = script(
        &task,
        "save",
        true,
        Path::new("/tmp/proposed 'task'.xml"),
        "fixed-digest",
    )
    .unwrap();
    let mut child = Command::new("/bin/bash")
        .arg("-n")
        .stdin(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(script.as_bytes())
        .unwrap();
    assert!(child.wait().unwrap().success());
    assert!(script.contains("Task changed; refresh before retrying"));
    assert!(script.contains("System launchd paths cannot be writable by other users"));
    assert!(script.contains("Proposed task configuration changed"));
    assert!(!script.contains("<plist"));
    for (label, path, domain) in [
        (
            "com.apple.audit",
            "/Library/LaunchDaemons/audit.plist",
            "system",
        ),
        ("-invalid", "/Library/LaunchDaemons/audit.plist", "system"),
        (
            "org.example.audit",
            "/System/Library/LaunchDaemons/audit.plist",
            "system",
        ),
        (
            "org.example.audit",
            "/Library/LaunchDaemons/audit.plist",
            "gui/501",
        ),
        (
            "org.example.audit",
            "/Library/LaunchAgents/audit.plist",
            "system",
        ),
    ] {
        let mut invalid = snapshot(path.into());
        invalid.label = label.into();
        invalid.domain = domain.into();
        assert!(super::script(&invalid, "remove", false, Path::new("unused"), "").is_err());
    }
}

fn transaction(
    operation: &str,
    enabled: bool,
    fail_bootstrap: bool,
) -> (tempfile::TempDir, PathBuf, std::process::Output) {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("agents");
    std::fs::create_dir(&root).unwrap();
    let path = root.join("audit.plist");
    let original = snapshot(path.clone());
    std::fs::write(&path, &original.bytes).unwrap();
    let work = temp.path().join("work");
    std::fs::create_dir(&work).unwrap();
    std::fs::write(work.join("original.plist"), &original.bytes).unwrap();
    let mut value = original.value.clone();
    value["StartCalendarInterval"]["Hour"] = 8.into();
    let mut proposed = Vec::new();
    plist::to_writer_xml(&mut proposed, &value).unwrap();
    std::fs::write(work.join("proposed.plist"), proposed).unwrap();
    let fake = temp.path().join("launchctl");
    let log = temp.path().join("calls");
    let once = temp.path().join("failed");
    let fake_body = format!(
        r#"#!/bin/bash
set -eu
printf '%s\n' "$1" >> {}
if [[ "$1" == bootstrap ]]; then
  [[ "$(/usr/bin/plutil -extract RunAtLoad raw -o - "$3")" == false ]] || exit 71
  if [[ {} == true && ! -f {} ]]; then touch {}; exit 72; fi
fi
"#,
        quote(&log.to_string_lossy()),
        fail_bootstrap,
        quote(&once.to_string_lossy()),
        quote(&once.to_string_lossy())
    );
    std::fs::write(&fake, fake_body).unwrap();
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o700)).unwrap();
    let meta = std::fs::metadata(&path).unwrap();
    let header = format!("set -Eeuo pipefail\npath={}\nroot={}\nwork={}\nlabel=org.example.audit\ndomain=system\nloaded=true\nexpected_enabled=true\noperation={}\nenabled={}\nmode=600\nowner={}\ngroup={}\n", quote(&path.to_string_lossy()),quote(&root.to_string_lossy()),quote(&work.to_string_lossy()),quote(operation),enabled,meta.uid(),meta.gid());
    // Exercise the production transaction in an isolated user-owned directory;
    // the elevated preflight is covered separately and is never bypassed in production.
    let body = include_str!("../admin.sh")
        .strip_suffix("preflight\nperform\n")
        .unwrap();
    let body = body
        .replace("work=''", "# workspace supplied by the test")
        .replace("/bin/launchctl", &fake.to_string_lossy());
    let output = Command::new("/bin/bash")
        .arg("-c")
        .arg(format!("{header}{body}\nperform\n"))
        .output()
        .unwrap();
    (temp, path, output)
}

#[test]
fn system_save_preserves_run_at_load_without_executing_and_rolls_back_failed_registration() {
    let (temp, path, output) = transaction("save", true, false);
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value: Value = serde_json::to_value(plist::Value::from_file(&path).unwrap()).unwrap();
    assert_eq!(value["StartCalendarInterval"]["Hour"], 8);
    assert_eq!(value["RunAtLoad"], true);
    assert_eq!(
        std::fs::read_to_string(temp.path().join("calls")).unwrap(),
        "bootout\nenable\nbootstrap\n"
    );
    let (temp, path, output) = transaction("save", true, true);
    assert!(!output.status.success());
    let value: Value = serde_json::to_value(plist::Value::from_file(&path).unwrap()).unwrap();
    assert_eq!(value["StartCalendarInterval"]["Hour"], 7);
    assert_eq!(value["RunAtLoad"], true);
    assert!(
        String::from_utf8_lossy(&output.stderr).contains("previous configuration restored: true")
    );
    assert_eq!(
        std::fs::read_to_string(temp.path().join("calls")).unwrap(),
        "bootout\nenable\nbootstrap\nbootout\nenable\nbootstrap\n"
    );
}

#[test]
fn system_pause_delete_and_explicit_run_have_distinct_side_effects() {
    let (temp, path, output) = transaction("save", false, false);
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(path.exists());
    assert_eq!(
        std::fs::read_to_string(temp.path().join("calls")).unwrap(),
        "bootout\ndisable\n"
    );
    let (temp, path, output) = transaction("remove", false, false);
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(!path.exists());
    assert_eq!(
        std::fs::read_to_string(temp.path().join("calls")).unwrap(),
        "bootout\n"
    );
    let (temp, path, output) = transaction("run", true, false);
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(path.exists());
    assert_eq!(
        std::fs::read_to_string(temp.path().join("calls")).unwrap(),
        "kickstart\n"
    );
}

#[test]
fn authorized_preflight_rejects_stale_configuration_state_runtime_and_payload_before_mutation() {
    use std::os::unix::fs::PermissionsExt;
    for scenario in ["file", "disabled", "running", "path", "payload"] {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("agents");
        let private = temp.path().join("private");
        std::fs::create_dir(&root).unwrap();
        std::fs::create_dir(&private).unwrap();
        let path = root.join("audit.plist");
        let task = snapshot("/Library/LaunchDaemons/audit.plist".into());
        std::fs::write(&path, &task.bytes).unwrap();
        let payload = temp.path().join("proposed.plist");
        std::fs::write(&payload, &task.bytes).unwrap();
        let digest = format!("{:x}", Sha256::digest(&task.bytes));
        let fake = temp.path().join("launchctl");
        let log = temp.path().join("calls");
        let disabled = if scenario == "disabled" {
            "true"
        } else {
            "false"
        };
        let state = if scenario == "running" {
            "running"
        } else {
            "not running"
        };
        let loaded_path = if scenario == "path" {
            temp.path().join("other.plist")
        } else {
            path.clone()
        };
        std::fs::write(
            &fake,
            format!(
                r#"#!/bin/bash
set -eu
printf '%s\n' "$1" >> {}
case "$1" in
  print-disabled) printf '"org.example.audit" => {}\n' ;;
  print) printf 'path = %s\nstate = {}\n' {} ;;
  *) exit 79 ;;
esac
"#,
                quote(&log.to_string_lossy()),
                disabled,
                state,
                quote(&loaded_path.to_string_lossy())
            ),
        )
        .unwrap();
        std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o700)).unwrap();
        let uid = std::fs::metadata(&path).unwrap().uid();
        let script = super::script(&task, "save", true, &payload, &digest)
            .unwrap()
            .replace("/Library/LaunchDaemons", &root.to_string_lossy())
            .replace(
                "for item in /Library ",
                &format!("for item in {} ", quote(&temp.path().to_string_lossy())),
            )
            .replace(" == 0 ]]", &format!(" == {uid} ]]"))
            .replace("/private/var/root", &private.to_string_lossy())
            .replace("/bin/launchctl", &fake.to_string_lossy());
        if scenario == "file" {
            std::fs::write(&path, b"changed after snapshot").unwrap();
        }
        if scenario == "payload" {
            std::fs::write(&payload, b"changed after authorization started").unwrap();
        }
        let before = std::fs::read(&path).unwrap();
        let result = Command::new("/bin/bash")
            .arg("-c")
            .arg(script)
            .output()
            .unwrap();
        assert!(!result.status.success(), "accepted {scenario}");
        assert_eq!(std::fs::read(&path).unwrap(), before);
        if let Ok(calls) = std::fs::read_to_string(&log) {
            assert!(
                calls
                    .lines()
                    .all(|call| ["print-disabled", "print"].contains(&call)),
                "mutated during {scenario}: {calls}"
            );
        }
        let error = String::from_utf8_lossy(&result.stderr);
        let expected = match scenario {
            "file" => "Task changed",
            "disabled" => "enabled state changed",
            "running" => "current run",
            "path" => "different source path",
            _ => "Proposed task configuration changed",
        };
        assert!(error.contains(expected), "{scenario}: {error}");
    }
}
