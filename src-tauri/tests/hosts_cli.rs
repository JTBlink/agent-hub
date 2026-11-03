//! CLI tests use an isolated profile library; no system Hosts writes are allowed.
use serde_json::Value;
use std::{
    io::Write,
    path::Path,
    process::{Command, Output, Stdio},
};

fn cli(root: &Path, args: &[&str], stdin: Option<&[u8]>) -> Output {
    let binary = std::env::var_os("AGENT_HUB_TEST_CLI")
        .unwrap_or_else(|| env!("CARGO_BIN_EXE_agent-hub-cli").into());
    let mut child = Command::new(binary)
        .args(["--json", "--skills-root"])
        .arg(root)
        .arg("hosts")
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    if let Some(input) = stdin {
        child.stdin.take().unwrap().write_all(input).unwrap();
    }
    child.wait_with_output().unwrap()
}
fn success(output: Output) -> Value {
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}
fn failure(output: Output, message: &str) {
    assert!(!output.status.success());
    let error: Value = serde_json::from_slice(&output.stderr).unwrap();
    assert_eq!(error["ok"], false);
    assert!(
        error["message"].as_str().unwrap().contains(message),
        "{error}"
    );
}

#[test]
fn manages_profiles_from_stdin_and_files_with_revision_checks() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("skills");
    assert_eq!(success(cli(&root, &["list"], None)), serde_json::json!([]));
    let created = success(cli(
        &root,
        &["create", "--name", "Development", "--file", "-"],
        Some(b"127.0.0.1 app.test\n"),
    ));
    let id = created["id"].as_str().unwrap();
    let revision = created["revision"].as_str().unwrap();
    assert!(created["path"]
        .as_str()
        .unwrap()
        .ends_with(&format!("{id}.hosts")));
    let file = dir.path().join("input.hosts");
    std::fs::write(&file, "::1 app.test\n").unwrap();
    let updated = success(cli(
        &root,
        &[
            "update",
            id,
            "--revision",
            revision,
            "--file",
            file.to_str().unwrap(),
        ],
        None,
    ));
    assert_eq!(updated["content"], "::1 app.test\n");
    failure(
        cli(&root, &["delete", id, "--revision", revision], None),
        "HOSTS_PROFILE_CONFLICT",
    );
    let renamed = success(cli(
        &root,
        &[
            "rename",
            id,
            "--name",
            "Renamed",
            "--revision",
            updated["revision"].as_str().unwrap(),
        ],
        None,
    ));
    assert_eq!(renamed["id"], created["id"]);
    assert_eq!(
        success(cli(&root, &["show", "Renamed"], None))["content"],
        updated["content"]
    );
    let copied = success(cli(&root, &["copy", id, "--name", "Copy"], None));
    assert_ne!(copied["id"], created["id"]);
    assert_eq!(copied["content"], updated["content"]);
    success(cli(
        &root,
        &[
            "delete",
            id,
            "--revision",
            renamed["revision"].as_str().unwrap(),
        ],
        None,
    ));
    assert_eq!(
        success(cli(&root, &["list"], None))
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn rejects_invalid_input_and_ambiguous_names_without_modifying_profiles() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("skills");
    failure(
        cli(
            &root,
            &["create", "--name", "Invalid", "--file", "-"],
            Some(b"invalid\n"),
        ),
        "HOSTS_INVALID_LINE",
    );
    failure(
        cli(
            &root,
            &["create", "--name", "Invalid", "--file", "-"],
            Some(&[255]),
        ),
        "HOSTS_ENCODING",
    );
    assert_eq!(success(cli(&root, &["list"], None)), serde_json::json!([]));
    for _ in 0..2 {
        success(cli(
            &root,
            &["create", "--name", "Duplicate", "--file", "-"],
            Some(b"# valid\n"),
        ));
    }
    failure(
        cli(&root, &["show", "Duplicate"], None),
        "HOSTS_PROFILE_AMBIGUOUS",
    );
    failure(
        cli(&root, &["show", "missing"], None),
        "HOSTS_PROFILE_NOT_FOUND",
    );
}

#[test]
fn refuses_system_writes_in_an_isolated_library_before_opening_input_or_resolving_profiles() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("skills");
    failure(
        cli(
            &root,
            &[
                "system",
                "write",
                "--revision",
                "unused",
                "--file",
                "missing",
            ],
            None,
        ),
        "cannot be combined",
    );
    failure(
        cli(
            &root,
            &[
                "apply",
                "missing",
                "--revision",
                "unused",
                "--system-revision",
                "unused",
            ],
            None,
        ),
        "cannot be combined",
    );
    assert!(!root.exists());
}
