//! Explicit opt-in smoke test: registers only a unique, manual-only user job.
//! Never edits an existing job or invokes any user command.
use serde_json::{json, Value};
use std::{
    path::Path,
    process::{Command, Output},
};

fn cli(root: &Path, args: &[&str]) -> Output {
    // Pin an artifact when another developer build can replace Cargo's binary.
    let binary = std::env::var_os("AGENT_HUB_TEST_CLI")
        .unwrap_or_else(|| env!("CARGO_BIN_EXE_agent-hub-cli").into());
    Command::new(binary)
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

#[test]
fn cli_exposes_a_single_disk_cleanup_draft_for_scheduling_without_registering_a_task() {
    let temporary = tempfile::tempdir().unwrap();
    let catalog = success(cli(temporary.path(), &["templates", "--locale", "zh"]));
    let templates = catalog["templates"].as_array().unwrap();
    assert_eq!(
        templates
            .iter()
            .map(|item| item["id"].as_str().unwrap())
            .collect::<Vec<_>>(),
        if cfg!(target_os = "macos") {
            vec![
                "agent-maintenance",
                "agent-mr-processing",
                "agent-issue-processing",
                "disk-cleanup",
                "network-reset",
            ]
        } else {
            vec![
                "agent-maintenance",
                "agent-mr-processing",
                "agent-issue-processing",
                "disk-cleanup",
            ]
        }
    );
    assert!(!templates.iter().any(|t| matches!(
        t["id"].as_str(),
        Some("disk-check" | "temp-cleanup" | "log-cleanup")
    )));
    let cleanup = templates
        .iter()
        .find(|t| t["id"] == "disk-cleanup")
        .unwrap();
    assert_eq!(cleanup["title"], "清理磁盘缓存");
    let draft: app_lib::core::automation::AutomationDraft =
        serde_json::from_value(cleanup["draft"].clone()).unwrap();
    assert_eq!(
        draft.schedule,
        app_lib::core::automation::Schedule::Daily {
            hour: 3,
            minute: 0,
            weekdays: false
        }
    );
    assert_eq!(
        draft.content,
        if cfg!(windows) {
            "& './scripts/run.ps1'"
        } else {
            "sh './scripts/run.sh'"
        }
    );
    assert_eq!(draft.files.len(), 9);
    assert!(draft
        .files
        .last()
        .unwrap()
        .content
        .contains("disk-cleanup.py"));
    assert!(draft
        .files
        .iter()
        .any(|file| file.path == "scripts/cleanup-config.json"));
    assert!(draft.files[0].content.contains("parse_options"));
    assert_eq!(std::fs::read_dir(temporary.path()).unwrap().count(), 0);
}
struct Cleanup<'a> {
    root: &'a Path,
    id: String,
}

#[test]
#[ignore = "Registers a unique manual-only Python template task; run explicitly on a desktop host"]
fn runs_customized_bundled_python_files_and_queues_their_contents_for_backup() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().join("runtime");
    let workspace = temporary.path().join("workspace");
    std::fs::create_dir_all(workspace.join("tmp")).unwrap();
    let catalog = success(cli(&root, &["templates"]));
    let mut draft = catalog["templates"]
        .as_array()
        .unwrap()
        .iter()
        .find(|template| template["id"] == "disk-cleanup")
        .unwrap()["draft"]
        .clone();
    draft["workdir"] = json!(workspace);
    // Keep the opt-in native smoke task confined to its workspace, with no notification.
    for file in draft["files"].as_array_mut().unwrap() {
        if file["path"] == "scripts/cleanup-config.json" {
            let mut config: Value =
                serde_json::from_str(file["content"].as_str().unwrap()).unwrap();
            for key in [
                "user_caches",
                "agent_caches",
                "browser_cache",
                "uv_prune",
                "brew_cleanup",
                "updater_cache",
                "notify",
                "detect_workspace_builds",
            ] {
                config[key] = json!(false);
            }
            file["content"] = json!(serde_json::to_string_pretty(&config).unwrap());
        }
    }
    draft["schedule"] = json!({"kind":"manual"});
    draft["enabled"] = json!(false);
    draft["files"]
        .as_array_mut()
        .unwrap()
        .push(json!({"path":"scripts/helper.py","content":"VALUE = 1\n"}));
    let definition = temporary.path().join("task.json");
    std::fs::write(&definition, draft.to_string()).unwrap();
    let created = success(cli(
        &root,
        &["create", "--file", definition.to_str().unwrap()],
    ));
    let cleanup = Cleanup {
        root: &root,
        id: created["id"].as_str().unwrap().into(),
    };
    let task = success(cli(&root, &["show", &cleanup.id]));
    let package = std::path::PathBuf::from(task["definition"]["script_dir"].as_str().unwrap());
    let file = package.join("scripts/cleanup-config.json");
    let content = std::fs::read_to_string(&file).unwrap();
    let mut config: Value = serde_json::from_str(&content).unwrap();
    config["workspace_tmp_days"] = json!(14);
    std::fs::write(&file, serde_json::to_string_pretty(&config).unwrap()).unwrap();
    std::fs::write(package.join("scripts/helper.py"), "VALUE = 2\n").unwrap();
    let retained = workspace.join("tmp/ten-days-old.tmp");
    std::fs::write(&retained, "keep after customization").unwrap();
    std::fs::File::options()
        .write(true)
        .open(&retained)
        .unwrap()
        .set_times(std::fs::FileTimes::new().set_modified(
            std::time::SystemTime::now() - std::time::Duration::from_secs(10 * 86400),
        ))
        .unwrap();
    success(cli(&root, &["run", &cleanup.id]));
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
    loop {
        let runs = success(cli(&root, &["runs", &cleanup.id]));
        if runs["runs"][0]["exit_code"] == 0 {
            break;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "Python cleanup completed"
        );
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    assert!(retained.is_file(), "the customized 14-day rule is used");
    let task = success(cli(&root, &["show", &cleanup.id]));
    assert_ne!(task["revision"], 1);
    let files = task["definition"]["files"].as_array().unwrap();
    assert!(files
        .iter()
        .any(|file| file["path"] == "scripts/cleanup-config.json"
            && file["content"]
                .as_str()
                .unwrap()
                .contains("\"workspace_tmp_days\": 14")));
    assert!(files
        .iter()
        .any(|file| file["path"] == "scripts/helper.py" && file["content"] == "VALUE = 2\n"));
    let receipt: Value =
        serde_json::from_slice(&std::fs::read(package.join(".local/receipt.json")).unwrap())
            .unwrap();
    assert_eq!(receipt["pending_backup"], true);
    let exported = temporary.path().join("customized.json");
    success(cli(
        &root,
        &["export", &cleanup.id, "--file", exported.to_str().unwrap()],
    ));
    let exported: Value = serde_json::from_slice(&std::fs::read(exported).unwrap()).unwrap();
    assert!(exported["draft"]["files"]
        .as_array()
        .unwrap()
        .iter()
        .any(|file| file["path"] == "scripts/helper.py" && file["content"] == "VALUE = 2\n"));
    assert!(success(cli(&root, &["logs", &cleanup.id]))["content"]
        .as_str()
        .unwrap()
        .contains("清理后磁盘空间："));
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
    let workspace = root.join("workspaces").join("Automation smoke test");
    let dir = workspace.join(".local");
    assert!(workspace.is_dir(), "omitted workdir is provisioned on save");
    let script = workspace.join(if cfg!(windows) {
        "scripts/run.ps1"
    } else {
        "scripts/run.sh"
    });
    assert!(
        script.is_file(),
        "the command script lives in the task workspace"
    );
    assert!(std::fs::read_to_string(&script).unwrap().contains(content));
    assert!(!dir
        .join(if cfg!(windows) {
            "command.ps1"
        } else {
            "command.sh"
        })
        .exists());
    std::fs::write(workspace.join("artifact.txt"), "keep workspace files").unwrap();
    assert!(
        !dir.join("started").exists(),
        "saving must not execute the task"
    );
    draft["name"] = json!("Edited smoke test");
    draft["enabled"] = json!(false);
    draft["schedule"] = json!({"kind": "daily", "hour": 4, "minute": 15, "weekdays": true});
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
    let scheduled = success(cli(&root, &["show", &cleanup.id]));
    assert_eq!(scheduled["definition"]["schedule"], draft["schedule"]);
    assert!(
        !dir.join("started").exists(),
        "editing the schedule must not run the task"
    );
    draft["schedule"] = json!({"kind": "manual"});
    std::fs::write(&file, draft.to_string()).unwrap();
    success(cli(
        &root,
        &[
            "edit",
            &cleanup.id,
            "--file",
            file.to_str().unwrap(),
            "--revision",
            "2",
        ],
    ));
    success(cli(&root, &["resume", &cleanup.id]));
    assert_eq!(
        success(cli(&root, &["show", &cleanup.id]))["definition"]["enabled"],
        true
    );
    success(cli(&root, &["pause", &cleanup.id]));
    assert_eq!(
        success(cli(&root, &["show", &cleanup.id]))["definition"]["enabled"],
        false
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
    assert_eq!(task["revision"], 5);
    assert_eq!(task["definition"]["schedule"]["kind"], "manual");
    assert_eq!(task["definition"]["enabled"], false);
    assert_eq!(task["last_result"], "0");
    assert!(task["project"].is_null());
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
    let history = success(cli(&root, &["runs", &cleanup.id]));
    assert_eq!(history["runs"].as_array().unwrap().len(), 1);
    let first_run = history["runs"][0]["id"].as_str().unwrap().to_owned();
    assert_eq!(
        success(cli(&root, &["logs", &cleanup.id, "--run", &first_run]))["content"]
            .as_str()
            .unwrap()
            .trim(),
        "automation test"
    );
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
    while success(cli(&root, &["show", &cleanup.id]))["status"] == "running" {
        assert!(std::time::Instant::now() < deadline);
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    let custom_content = if cfg!(windows) {
        "Write-Output 'customized automation test'"
    } else {
        "printf 'customized automation test\\n'"
    };
    std::fs::write(&script, custom_content).unwrap();
    success(cli(&root, &["run", &cleanup.id]));
    let customized = success(cli(&root, &["show", &cleanup.id]));
    assert_ne!(customized["revision"], 5);
    assert_eq!(
        customized["definition"]["content"],
        if cfg!(windows) {
            "& './scripts/run.ps1'"
        } else {
            "sh './scripts/run.sh'"
        }
    );
    assert_eq!(
        customized["definition"]["files"][0]["content"],
        custom_content
    );
    assert_eq!(std::fs::read_to_string(&script).unwrap(), custom_content);
    assert!(!cli(
        &root,
        &[
            "edit",
            &cleanup.id,
            "--file",
            file.to_str().unwrap(),
            "--revision",
            "5"
        ]
    )
    .status
    .success());
    assert_eq!(std::fs::read_to_string(&script).unwrap(), custom_content);
    let history = loop {
        let history = success(cli(&root, &["runs", &cleanup.id]));
        if history["runs"].as_array().unwrap().len() == 2 && history["runs"][0]["exit_code"] == 0 {
            break history;
        }
        assert!(std::time::Instant::now() < deadline, "second run completed");
        std::thread::sleep(std::time::Duration::from_millis(100));
    };
    assert_ne!(first_run, history["runs"][0]["id"].as_str().unwrap());
    assert_eq!(
        success(cli(&root, &["logs", &cleanup.id]))["content"]
            .as_str()
            .unwrap()
            .trim(),
        "customized automation test"
    );
    let receipt: Value =
        serde_json::from_slice(&std::fs::read(dir.join("receipt.json")).unwrap()).unwrap();
    assert_eq!(receipt["pending_backup"], true);
    assert_eq!(
        success(cli(&root, &["logs", &cleanup.id, "--run", &first_run]))["content"]
            .as_str()
            .unwrap()
            .trim(),
        "automation test"
    );
    assert!(!cli(&root, &["logs", &cleanup.id, "--run", "../outside"])
        .status
        .success());
    while success(cli(&root, &["show", &cleanup.id]))["status"] == "running" {
        assert!(std::time::Instant::now() < deadline);
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    success(cli(&root, &["remove", &cleanup.id, "--delete-local-data"]));
    assert!(!dir.exists(), "opt-in deletion removes runtime records");
    assert!(
        !workspace.exists(),
        "opt-in deletion removes the assigned workspace"
    );
    assert!(!cli(&root, &["show", &cleanup.id]).status.success());
}
