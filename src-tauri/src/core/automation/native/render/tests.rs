use super::*;
fn task(schedule: Schedule) -> ManagedAutomation {
    ManagedAutomation {
        id: format!("agent_hub:{}", uuid::Uuid::new_v4()),
        revision: 1,
        draft: AutomationDraft {
            package_options: None,
            files: Vec::new(),
            name: "Audit & test".into(),
            provider: super::super::super::definition::Provider::System,
            content: "exit 7".into(),
            script_dir: None,
            workdir: None,
            schedule,
            enabled: true,
        },
        source: "launchd".into(),
        identifier: "org.example.audit".into(),
        location: "<workspace>".into(),
    }
}
#[test]
fn hourly_schedules_pin_the_minute_and_roll_over_at_midnight() {
    let task = task(Schedule::Hourly { minute: 15 });
    let data = plist::Value::from_reader(std::io::Cursor::new(
        launchd(&task, Path::new("run.sh")).unwrap(),
    ))
    .unwrap();
    let calendar = data.as_dictionary().unwrap()["StartCalendarInterval"]
        .as_dictionary()
        .unwrap();
    assert_eq!(calendar.len(), 1);
    assert_eq!(calendar["Minute"].as_unsigned_integer(), Some(15));
    assert!(systemd_timer(&task).contains("OnCalendar=*-*-* *:15:00"));
    let now = chrono::NaiveDate::from_ymd_opt(2026, 10, 29)
        .unwrap()
        .and_hms_opt(23, 20, 0)
        .unwrap();
    assert_eq!(next_hourly(now, 15).to_string(), "2026-10-30 00:15:00");
    assert_eq!(next_hourly(now, 45).to_string(), "2026-10-29 23:45:00");
    assert!(
        windows(&task, Path::new("run.ps1"), "S-1-5-21-1000").contains("<Interval>PT1H</Interval>")
    );
}
#[test]
fn renders_platform_calendars_without_running_on_save_or_changing_weekday_semantics() {
    let task = task(Schedule::Daily {
        hour: 9,
        minute: 15,
        weekdays: true,
    });
    let plist = plist::Value::from_reader(std::io::Cursor::new(
        launchd(&task, Path::new("/tmp/demo & test/run.sh")).unwrap(),
    ))
    .unwrap();
    assert_eq!(
        plist.as_dictionary().unwrap()["RunAtLoad"].as_boolean(),
        Some(false)
    );
    assert_eq!(
        plist.as_dictionary().unwrap()["StartCalendarInterval"]
            .as_array()
            .unwrap()
            .len(),
        5
    );
    assert!(systemd_timer(&task).contains("Mon..Fri *-*-* 09:15:00"));
    let windows = windows(&task, Path::new("C:/demo & test/run.ps1"), "S-1-5-21-1000");
    assert!(
        windows.contains("<Monday/>")
            && windows.contains("demo &amp; test")
            && windows.contains("IgnoreNew")
    );
}
#[test]
fn paused_and_manual_launchd_jobs_remain_available_for_manual_triggers() {
    let mut task = task(Schedule::Interval { minutes: 10 });
    task.draft.enabled = false;
    let data = String::from_utf8(launchd(&task, Path::new("run.sh")).unwrap()).unwrap();
    assert!(!data.contains("StartInterval"));
    assert!(!windows(&task, Path::new("run.ps1"), "S-1-5-21-1000").contains("<TimeTrigger>"));
}
#[cfg(unix)]
#[test]
fn wrapper_preserves_multiline_commands_quoted_paths_and_exit_status() {
    let root = tempfile::tempdir().unwrap();
    let dir = root.path().join("demo ' quoted");
    let mut task = task(Schedule::Manual);
    task.draft.content = "printf 'first line\n'\nprintf 'second line\n'\nexit 7".into();
    let script = scripts(&dir, &task.draft, &task.id, true).unwrap();
    assert!(!dir.join("started").exists());
    let output = std::process::Command::new("/bin/sh")
        .arg(script)
        .status()
        .unwrap();
    assert_eq!(output.code(), Some(7));
    assert_eq!(
        std::fs::read_to_string(dir.join("output.log")).unwrap(),
        "first line\nsecond line\n"
    );
    assert_eq!(
        std::fs::read_to_string(dir.join("exit")).unwrap().trim(),
        "7"
    );
    assert!(!std::fs::read_to_string(dir.join("started"))
        .unwrap()
        .is_empty());
}
