use super::*;
#[test]
fn marks_windows_maintenance_without_hiding_custom_or_office_tasks() {
    let tasks = parse(r#"[{"path":"\\Microsoft\\Windows\\Defrag\\ScheduledDefrag"},{"path":"\\microsoft\\windows\\Update\\Check"},{"path":"\\Microsoft\\Office\\Update"},{"path":"\\Custom\\Backup"}]"#).unwrap();
    assert_eq!(
        tasks.iter().map(|t| t.is_builtin).collect::<Vec<_>>(),
        vec![true, true, false, false]
    );
}
#[test]
fn reads_unicode_and_disabled_tasks_and_reports_invalid_output() {
    let tasks = parse(r#"[{"name":"仓库审计","path":"\\Audit","state":"Disabled","next_run":"2026-11-01T09:00:00","schedule":"Daily","last_run":null} , {"name":"Cleanup","path":"\\Cleanup","state":"Running"}]"#).unwrap();
    assert_eq!(tasks[0].name, "仓库审计");
    assert!(tasks[0].next_run.is_none());
    assert_eq!(tasks[0].status, "paused");
    assert_eq!(tasks[1].status, "running");
    assert!(parse("not json").is_err());
    assert!(parse("[]").unwrap().is_empty());
}
