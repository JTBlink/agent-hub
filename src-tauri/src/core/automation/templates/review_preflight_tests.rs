use super::builtin;

#[test]
fn installed_review_preflight_skips_models_and_tracks_each_platforms_reviewed_versions() {
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
        let result =
            std::process::Command::new(crate::core::automation::native::python_runtime().unwrap())
                .arg("-c")
                .arg(include_str!("fixtures/review_preflight_checks.py"))
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
