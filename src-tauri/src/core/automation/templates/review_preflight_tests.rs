use super::builtin;

#[test]
fn review_entrypoint_selects_requests_before_launching_agent() {
    for shell in ["sh", "powershell"] {
        let mut template = builtin::all_templates("zh", false, shell)
            .into_iter()
            .find(|template| template.id == "agent-mr-processing")
            .unwrap();
        template.draft.validate().unwrap();
        let root = tempfile::tempdir().unwrap();
        for file in &template.draft.files {
            let path = root.path().join(&file.path);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(
                path,
                format!(
                    "# AgentHub automation script: agent_hub:test\n{}",
                    file.content
                ),
            )
            .unwrap();
        }
        // Real callback subprocesses resolve the shared store through an isolated CLI fixture.
        let store = root.path().join("shared_store.py");
        std::fs::write(&store, include_str!("../../state_store/store.py")).unwrap();
        let cli = root.path().join(if cfg!(windows) {
            "fixture-cli.cmd"
        } else {
            "fixture-cli"
        });
        let response = serde_json::json!({"path": store}).to_string();
        let script = if cfg!(windows) {
            format!("@echo off\r\necho {response}\r\n")
        } else {
            format!(
                "#!/bin/sh\nprintf '%s' '{}'\n",
                response.replace('\'', "'\\''")
            )
        };
        std::fs::write(&cli, script).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&cli, std::fs::Permissions::from_mode(0o700)).unwrap();
        }
        for checks in [
            include_str!("fixtures/review_preflight_checks.py"),
            include_str!("fixtures/review_label_checks.py"),
        ] {
            let result = std::process::Command::new(
                crate::core::automation::native::python_runtime().unwrap(),
            )
            .arg("-c")
            .arg(checks)
            .arg(root.path().join("scripts/review.py"))
            .env("AGENT_HUB_CLI", &cli)
            .env("PYTHONDONTWRITEBYTECODE", "1")
            .output()
            .unwrap();
            assert!(
                result.status.success(),
                "{}\n{}",
                String::from_utf8_lossy(&result.stdout),
                String::from_utf8_lossy(&result.stderr)
            );
        }
    }
}

#[test]
fn task_state_distribution_matches_shared_storage_source() {
    assert_eq!(
        include_str!("../../../../../automations/_shared/task-state.py"),
        include_str!(
            "../../../../../automations/engineering/agent-mr-processing/scripts/task_state.py"
        )
    );
}
