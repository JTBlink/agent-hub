use super::*;
use serde_json::json;
fn parse(
    value: &Value,
    location: &str,
    loaded: Option<&HashMap<String, (bool, String)>>,
) -> Option<AutomationTask> {
    super::parse(
        value,
        location,
        loaded,
        &mut super::super::launchd_names::Resolver::new("en"),
    )
}
#[test]
fn marks_apple_jobs_without_hiding_user_or_third_party_jobs() {
    for (label, path, expected) in [
        (
            "com.apple.maintenance",
            "~/Library/LaunchAgents/audit.plist",
            true,
        ),
        (
            "org.example.maintenance",
            "/System/Library/LaunchDaemons/audit.plist",
            true,
        ),
        (
            "com.appleish.audit",
            "~/Library/LaunchAgents/audit.plist",
            false,
        ),
        (
            "org.example.audit",
            "/Library/LaunchDaemons/audit.plist",
            false,
        ),
    ] {
        let task = parse(&json!({"Label":label,"StartInterval":600}), path, None).unwrap();
        assert_eq!(task.is_builtin, expected, "{label}: {path}");
        assert_eq!(task.identifier.as_deref(), Some(label));
    }
}
#[test]
fn includes_only_timed_jobs_and_preserves_runtime_evidence() {
    let runtime = runtime("PID Status Label\n- 0 org.example.audit\n123 1 org.example.running\n");
    let value = json!({"Label":"org.example.audit","StartCalendarInterval":[{"Hour":9,"Minute":0,"Weekday":1},{"Hour":10}],"ProgramArguments":["/bin/echo","audit"]});
    let task = parse(&value, "~/Library/LaunchAgents/audit.plist", Some(&runtime)).unwrap();
    assert_eq!(task.name, "Audit");
    assert_eq!(task.identifier.as_deref(), Some("org.example.audit"));
    assert_eq!(task.schedule, "Hour=9 Minute=0 Weekday=1 ; Hour=10");
    assert_eq!(task.status, "active");
    assert!(task.last_run.is_none());
    assert!(task.last_result.is_none());
    assert!(parse(
        &json!({"Label":"service","KeepAlive":true}),
        "service.plist",
        None
    )
    .is_none());
    let task = parse(
        &json!({"Label":"org.example.running","StartInterval":60}),
        "run.plist",
        Some(&runtime),
    )
    .unwrap();
    assert_eq!(task.status, "running");
}
