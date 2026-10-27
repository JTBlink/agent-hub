//! Explicit opt-in smoke test: registers only a unique, manual-only user job.
//! Never edits an existing job or invokes any user command.
use serde_json::{json, Value};
use std::{
    path::Path,
    process::{Command, Output},
};

fn cli(root: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_agent-hub-cli"))
        .env("AGENT_HUB_AUTOMATION_HOME", root)
        .args(["--json", "automations"])
        .args(args)
        .output()
        .expect("CLI starts")
}
fn success(output: Output) -> Value {
    assert!(
        output.status.success(),
        "CLI error: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).expect("valid JSON")
}
struct Cleanup<'a> {
    root: &'a Path,
    id: String,
}
impl Drop for Cleanup<'_> {
    fn drop(&mut self) {
        let _ = cli(self.root, &["remove", &self.id]);
    }
}

#[test]
#[ignore = "Registers and removes a unique manual-only native task; run explicitly on a desktop host"]
fn creates_edits_and_manually_runs_a_native_task_without_changing_the_schedule() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().join("automations");
    let file = temporary.path().join("task.json");
    let content = if cfg!(windows) {
        "(Get-Location).Path | Set-Content -LiteralPath ran-from.txt\nWrite-Output 'automation test'"
    } else {
        "pwd > ran-from.txt\nprintf 'automation test\\n'"
    };
    let mut draft = json!({ "name": "Automation smoke test", "provider": "system", "content": content, "workdir": null, "schedule": { "kind": "manual" }, "enabled": true });
    std::fs::write(&file, draft.to_string()).unwrap();
    let created = success(cli(&root, &["create", "--file", file.to_str().unwrap()]));
    let cleanup = Cleanup {
        root: &root,
        id: created["id"].as_str().unwrap().into(),
    };
    let dir = root.join(cleanup.id.trim_start_matches("agent_hub:"));
    let workspace = root
        .join("workspaces")
        .join(cleanup.id.trim_start_matches("agent_hub:"))
        .join("workspace");
    assert!(workspace.is_dir(), "omitted workdir is provisioned on save");
    std::fs::write(workspace.join("artifact.txt"), "keep workspace files").unwrap();
    assert!(
        !dir.join("started").exists(),
        "saving must not execute the task"
    );
    draft["name"] = json!("Edited smoke test");
    draft["enabled"] = json!(false);
    std::fs::write(&file, draft.to_string()).unwrap();
    success(cli(
        &root,
        &[
            "edit",
            &cleanup.id,
            "--file",
            file.to_str().unwrap(),
            "--revision",
            "1",
        ],
    ));
    assert!(
        !cli(
            &root,
            &[
                "edit",
                &cleanup.id,
                "--file",
                file.to_str().unwrap(),
                "--revision",
                "1"
            ]
        )
        .status
        .success(),
        "stale edits must be rejected"
    );
    success(cli(&root, &["run", &cleanup.id]));
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    while !dir.join("exit").exists() && std::time::Instant::now() < deadline {
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    assert_eq!(
        std::fs::read_to_string(dir.join("exit")).unwrap().trim(),
        "0"
    );
    let task = success(cli(&root, &["show", &cleanup.id]));
    assert_eq!(task["origin"], "agent_hub");
    assert_eq!(task["revision"], 2);
    assert_eq!(task["definition"]["schedule"]["kind"], "manual");
    assert_eq!(task["definition"]["enabled"], false);
    assert_eq!(task["last_result"], "0");
    assert_eq!(task["project"].as_str(), workspace.to_str());
    assert!(
        workspace.join("ran-from.txt").is_file(),
        "the scheduler executes inside the provisioned directory"
    );
    let output = success(cli(&root, &["logs", &cleanup.id]));
    assert_eq!(output["available"], true);
    assert_eq!(output["kind"], "system");
    assert_eq!(
        output["content"].as_str().unwrap().trim(),
        "automation test"
    );
    assert!(
        !dir.join("runs").exists(),
        "reading output does not create execution history"
    );
    success(cli(&root, &["remove", &cleanup.id]));
    assert!(
        !dir.exists(),
        "deleting also removes owned scripts and output"
    );
    assert!(!cli(&root, &["show", &cleanup.id]).status.success());
}
