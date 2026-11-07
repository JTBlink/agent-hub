#![cfg(unix)] // HOME isolates the CLI data root; Windows known-folder resolution is process external.

use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
    path::Path,
    process::{Command, Stdio},
};

fn cli(root: &Path) -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_agent-hub-cli"));
    command
        .env("HOME", root)
        .env("USERPROFILE", root)
        .env("AGENT_HUB_BRIDGE_DIR", root.join("bridge"));
    command
}

#[test]
fn shared_tools_do_not_open_the_skills_database_or_reset_checkpoints() {
    let root = tempfile::tempdir().unwrap();
    let state = root.path().join("task-state");
    fs::create_dir(&state).unwrap();
    fs::write(
        state.join(".herdr-run.json"),
        r#"{"phase":"attention","pane":"w1:p1"}"#,
    )
    .unwrap();
    let output = cli(root.path())
        .args(["--json", "agents", "launch", "status", "--state-directory"])
        .arg(&state)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(
        serde_json::from_slice::<Value>(&output.stdout).unwrap()["phase"],
        "attention"
    );
    assert!(!root.path().join(".agent-hub/agent-hub.db").exists());
    let output = cli(root.path())
        .args(["--json", "agents", "launch", "runtime", "state-store"])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let resource: Value = serde_json::from_slice(&output.stdout).unwrap();
    let path = Path::new(resource["path"].as_str().unwrap());
    assert!(path.starts_with(root.path()));
    assert!(fs::read_to_string(path)
        .unwrap()
        .contains("class TaskState"));
    assert!(!root.path().join(".agent-hub/agent-hub.db").exists());
}

#[test]
fn execution_failure_preserves_old_state_and_json_output_stays_machine_readable() {
    let root = tempfile::tempdir().unwrap();
    let published = cli(root.path())
        .args(["--json", "publish-cli-bridge"])
        .output()
        .unwrap();
    assert!(
        published.status.success(),
        "{}",
        String::from_utf8_lossy(&published.stderr)
    );
    let workdir = root.path().join("project");
    let identity = root.path().join("task/scripts");
    let state = root.path().join("task/.local/state");
    for directory in [&workdir, &identity, &state] {
        fs::create_dir_all(directory).unwrap();
    }
    let checkpoint = state.join(".herdr-run.json");
    fs::write(&checkpoint, r#"{"phase":"attention","backend":"herdr"}"#).unwrap();
    let request = json!({"config_file":root.path().join("missing-config.json"),
        "prompt_file":root.path().join("prompt.md"), "state_directory":state,
        "identity_directory":identity, "workdir":workdir});
    let mut child = cli(root.path())
        .args(["--json", "agents", "launch", "execute"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(request.to_string().as_bytes())
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(!output.status.success());
    let result: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(result["exit_code"], 1);
    assert_eq!(result["checkpoint"]["phase"], "attention");
    assert_eq!(
        fs::read_to_string(checkpoint).unwrap(),
        r#"{"phase":"attention","backend":"herdr"}"#
    );
}
