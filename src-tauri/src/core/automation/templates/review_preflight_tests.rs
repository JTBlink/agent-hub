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
