use super::*;
#[test]
fn legacy_drafts_default_to_no_files_and_template_paths_are_validated() {
    let mut draft: AutomationDraft = serde_json::from_value(serde_json::json!({"name":"Cleanup","provider":"system","content":"python3 bundle/main.py","workdir":null,"schedule":{"kind":"manual"},"enabled":false})).unwrap();
    assert!(draft.files.is_empty());
    assert!(draft.script_dir.is_none());
    for path in [
        "../outside.py",
        "/absolute.py",
        "bundle/../../outside.py",
        "bundle\\outside.py",
        "C:outside.py",
    ] {
        draft.files = vec![AutomationScriptFile {
            path: path.into(),
            content: "print('test')".into(),
        }];
        assert!(draft.validate().is_err(), "{path}");
    }
    draft.files = vec![AutomationScriptFile {
        path: "bundle/main.py".into(),
        content: "print('test')".into(),
    }];
    assert!(draft.validate().is_ok());
    draft.files.extend([
        AutomationScriptFile {
            path: "bundle/cleanup-config.json".into(),
            content: "{\"notify\":false}".into(),
        },
        AutomationScriptFile {
            path: "bundle/README.md".into(),
            content: "# Usage".into(),
        },
    ]);
    assert!(draft.validate().is_ok());
    draft.files.push(draft.files[0].clone());
    assert!(draft.validate().is_err());
}
#[test]
fn hourly_schedules_validate_the_minute_and_preserve_cron_semantics() {
    assert!(Schedule::Hourly { minute: 59 }.validate().is_ok());
    assert!(Schedule::Hourly { minute: 60 }.validate().is_err());
    assert_eq!(Schedule::Hourly { minute: 15 }.display(), "15 * * * *");
}
#[test]
fn shell_entry_keeps_the_full_64_kib_script_budget() {
    let mut draft: AutomationDraft = serde_json::from_value(serde_json::json!({
        "name": "Audit", "provider": "system", "content": "sh './run.sh'", "workdir": null,
        "schedule": {"kind":"manual"}, "enabled": false,
        "files": [{"path":"run.sh", "content":"x".repeat(65536)}]
    }))
    .unwrap();
    assert!(draft.validate().is_ok());
    draft.files[0].content.push('x');
    assert!(draft.validate().is_err());
}
#[test]
fn validates_schedules_and_rejects_missing_directories_without_running_commands() {
    let mut draft = AutomationDraft {
        package_options: None,
        files: Vec::new(),
        name: "Audit".into(),
        provider: Provider::System,
        content: "exit 99".into(),
        script_dir: None,
        workdir: None,
        schedule: Schedule::Interval { minutes: 0 },
        enabled: true,
    };
    assert!(draft.validate().is_err());
    draft.schedule = Schedule::Daily {
        hour: 9,
        minute: 0,
        weekdays: true,
    };
    assert!(draft.validate().is_ok());
    draft.workdir = Some("relative/path".into());
    assert!(draft.validate().is_err());
    draft.workdir = None;
    draft.script_dir = Some("relative/scripts".into());
    assert!(draft.validate().is_err());
    assert!(!valid_id("agent_hub:../../other"));
}
