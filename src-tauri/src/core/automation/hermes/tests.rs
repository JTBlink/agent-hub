use super::*;

#[test]
fn reads_task_files_without_rewriting_them_and_keeps_partial_results() {
    let home = tempfile::tempdir().unwrap();
    let cron = home.path().join("cron");
    std::fs::create_dir(&cron).unwrap();
    let path = cron.join("jobs.json");
    let original = r#"{"jobs":[{"id":"audit","prompt":"Inspect repository","enabled":true}]}"#;
    std::fs::write(&path, original).unwrap();
    let mut report = AutomationOverview::default();
    read_store(home.path(), "default", &mut report);
    assert_eq!(report.tasks.len(), 1);
    assert_eq!(std::fs::read_to_string(&path).unwrap(), original);
    assert_eq!(std::fs::read_dir(&cron).unwrap().count(), 1);
    std::fs::write(&path, "invalid JSON").unwrap();
    read_store(home.path(), "coder", &mut report);
    assert_eq!(report.tasks.len(), 1);
    assert_eq!(report.issues.len(), 1);
}
#[test]
fn reads_disabled_and_active_jobs_and_keeps_profile_ids_distinct() {
    let input = r#"{"jobs":[{"id":"audit","name":"Audit","enabled":false,"next_run_at":"2026-11-01T09:00:00Z","schedule_display":"0 9 * * 1-5","prompt":"Inspect the repository"},{"id":"check","enabled":true,"state":"paused","schedule":{"expr":"*/10 * * * *"},"cwd":"<workspace>"}]}"#;
    let tasks = parse(input, "default", "~/demo/jobs.json").unwrap();
    assert_eq!(tasks[0].status, "paused");
    assert!(tasks[0].next_run.is_none());
    assert_eq!(tasks[1].status, "active");
    assert_eq!(tasks[1].project.as_deref(), Some("<workspace>"));
    let profile = parse(input, "coder", "~/demo/profiles/coder/jobs.json").unwrap();
    assert_ne!(tasks[0].id, profile[0].id);
    assert!(profile[0].name.ends_with("coder"));
}
#[test]
fn accepts_legacy_arrays_and_id_maps_and_reports_corrupt_files() {
    assert_eq!(parse("[]", "default", "jobs.json").unwrap().len(), 0);
    assert_eq!(
        parse(
            r#"{"jobs":{"audit":{"prompt":"Audit"}}}"#,
            "default",
            "jobs.json"
        )
        .unwrap()[0]
            .name,
        "audit"
    );
    assert!(parse("broken", "default", "jobs.json").is_err());
    assert!(parse("{}", "default", "jobs.json").is_err());
}
