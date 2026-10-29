#[cfg(test)]
mod tests {
    use crate::core::automation::{Provider, Schedule};

    #[test]
    fn template_bundles_editable_prompt_and_executes_without_model_requests() {
        for shell in ["sh", "powershell"] {
            for id in [
                "agent-code-review",
                "agent-maintenance",
                "agent-mr-processing",
                "agent-issue-processing",
            ] {
                let template = super::super::builtin::all_templates("zh", false, shell)
                    .into_iter()
                    .find(|template| template.id == id)
                    .unwrap();
                let mut draft = template.draft;
                draft.validate().unwrap();
                assert_eq!(draft.provider, Provider::System);
                assert!(matches!(
                    draft.schedule,
                    Schedule::Daily { .. } | Schedule::Hourly { .. }
                ));
                let entry = draft
                    .files
                    .iter()
                    .find(|file| file.path.ends_with(".py"))
                    .unwrap()
                    .path
                    .clone();
                let root = tempfile::tempdir().unwrap();
                for file in &draft.files {
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
                let result = std::process::Command::new(
                    crate::core::automation::native::python_runtime().unwrap(),
                )
                .arg("-c")
                .arg(include_str!("fixtures/herdr_agent_checks.py"))
                .arg(root.path().join(entry))
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
}
