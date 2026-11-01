use super::*;
#[test]
fn a_source_failure_preserves_tasks_from_other_sources() {
    let mut report = AutomationOverview::default();
    report.collect(
        "cron",
        Ok(vec![AutomationTask::new(
            "cron:1".into(),
            "Backup".into(),
            "cron",
            "crontab".into(),
        )]),
    );
    report.collect("hermes", Err("invalid jobs JSON".into()));
    assert_eq!(report.tasks.len(), 1);
    assert_eq!(report.issues.len(), 1);
    assert_eq!(report.issues[0].source, "hermes");
}
