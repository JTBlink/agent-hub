use super::*;
#[test]
fn clearing_an_existing_hermes_project_is_refused_before_cli_mutation() {
    let mut task = AutomationTask::new(
        "hermes:default:job".into(),
        "Audit".into(),
        "hermes",
        "<profile>/cron/jobs.json".into(),
    );
    task.project = Some("<workspace>".into());
    task.identifier = Some("job".into());
    let draft = draft(&task);
    let mut cleared = draft;
    cleared.workdir = None;
    assert!(edit(&task, &cleared)
        .unwrap_err()
        .contains("Clear the Hermes working directory"));
}
#[test]
fn prompts_and_names_are_literal_arguments_and_existing_fields_are_not_reset() {
    let draft = AutomationDraft {
        package_options: None,
        files: Vec::new(),
        name: "Audit $(ignored)".into(),
        provider: super::super::definition::Provider::Hermes,
        content: "Inspect\n$(literal)".into(),
        script_dir: None,
        workdir: None,
        schedule: Schedule::Interval { minutes: 10 },
        enabled: true,
    };
    let args = configuration("edit", Some("id"), &draft);
    assert!(args.contains(&format!("--prompt={}", draft.content)));
    assert!(!args.contains(&"--workdir".to_string()));
    assert!(!args.contains(&"--clear-skills".to_string()));
}
