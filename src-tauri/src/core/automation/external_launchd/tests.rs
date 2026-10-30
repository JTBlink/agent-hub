use super::*;
fn value() -> Value {
    json!({"Label":"org.example.audit", "StartInterval":600, "ProgramArguments":["/workspace/tool with spaces", "a'b", "$(literal)"], "WorkingDirectory":"/workspace/project", "EnvironmentVariables":{"LANG":"en_US.UTF-8"}, "StandardOutPath":"/workspace/audit.log", "RunAtLoad":false})
}
fn xml(value: &Value) -> Vec<u8> {
    let mut bytes = Vec::new();
    plist::to_writer_xml(&mut bytes, value).unwrap();
    bytes
}
#[test]
fn edits_preserve_arguments_environment_logs_and_all_unmodified_schedule_fields() {
    let mut value = value();
    let original = draft(&value, "Audit", true).unwrap();
    assert_eq!(
        original.content,
        "'/workspace/tool with spaces' 'a'\\''b' '$(literal)'"
    );
    let mut next = original.clone();
    next.name = "New audit".into();
    next.enabled = false;
    let old = value.clone();
    let bytes = update(&mut value, &next, &original).unwrap();
    for key in [
        "ProgramArguments",
        "EnvironmentVariables",
        "StandardOutPath",
        "StartInterval",
        "RunAtLoad",
    ] {
        assert_eq!(value[key], old[key]);
    }
    assert_eq!(value["Comment"], "New audit");
    assert_eq!(value["Disabled"], true);
    let decoded = plist::Value::from_reader(std::io::Cursor::new(bytes)).unwrap();
    assert_eq!(serde_json::to_value(decoded).unwrap(), value);
    next.content = "echo 'changed'".into();
    next.schedule = Schedule::Hourly { minute: 15 };
    update(&mut value, &next, &original).unwrap();
    assert_eq!(
        value["ProgramArguments"],
        json!(["/bin/sh", "-c", "echo 'changed'"])
    );
    assert!(value.get("StartInterval").is_none());
    assert_eq!(schedule(&value), Some(Schedule::Hourly { minute: 15 }));
    assert_ne!(revision(&xml(&old), true), revision(&xml(&old), false));
}
#[test]
fn preserves_calendar_semantics_and_rejects_jobs_that_could_run_while_saving() {
    for calendar in [
        json!({"Hour":9,"Minute":0,"Day":1,"Weekday":1}),
        json!([{"Hour":9,"Weekday":1},{"Hour":10}]),
        json!({"Month":5}),
        json!({"Hour":9}),
    ] {
        let mut value = value();
        value.as_object_mut().unwrap().remove("StartInterval");
        value["StartCalendarInterval"] = calendar;
        assert!(draft(&value, "Audit", true).is_none());
    }
    for key in [
        "KeepAlive",
        "StartOnMount",
        "WatchPaths",
        "QueueDirectories",
        "Sockets",
        "MachServices",
        "LaunchEvents",
    ] {
        let mut value = value();
        value[key] = true.into();
        assert!(draft(&value, "Audit", true).is_none(), "{key}");
    }
    let mut value = value();
    value.as_object_mut().unwrap().remove("StartInterval");
    value["StartCalendarInterval"] = json!((1..=5)
        .map(|day| json!({"Weekday":day,"Hour":9,"Minute":30}))
        .collect::<Vec<_>>());
    assert_eq!(
        schedule(&value),
        Some(Schedule::Daily {
            hour: 9,
            minute: 30,
            weekdays: true
        })
    );
    value["StartInterval"] = 600.into();
    assert!(schedule(&value).is_none());
}
#[test]
fn rejects_outside_paths_symlinks_and_foreign_ownership_and_respects_disabled_overrides() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("audit.plist");
    std::fs::write(&path, xml(&value())).unwrap();
    let uid = std::fs::metadata(&path).unwrap().uid();
    assert!(read(&path, dir.path(), uid).is_ok());
    assert!(read(&path, dir.path(), uid + 1).is_err());
    assert!(read(&path, &dir.path().join("other"), uid).is_err());
    let link = dir.path().join("link.plist");
    std::os::unix::fs::symlink(&path, &link).unwrap();
    assert!(read(&link, dir.path(), uid).is_err());
    let mut task = AutomationTask::new(
        format!("launchd:{}", path.display()),
        "Audit".into(),
        "launchd",
        path.to_string_lossy().into(),
    );
    task.identifier = Some("org.example.audit".into());
    decorate(
        &mut task,
        dir.path(),
        uid,
        &disabled("disabled services = {\n\"org.example.audit\" => true\n}"),
    );
    assert!(task.can_edit);
    assert!(!task.can_run);
    assert_eq!(task.status, "paused");
    assert!(!task.definition.unwrap().enabled);
}
#[test]
fn failed_registration_restores_the_original_file_and_loaded_state() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("audit.plist");
    let original = xml(&value());
    std::fs::write(&path, &original).unwrap();
    let snapshot = Snapshot {
        path: path.clone(),
        bytes: original.clone(),
        value: value(),
        label: "org.example.audit".into(),
        domain: "gui/501".into(),
        loaded: true,
        enabled: true,
        requires_admin: false,
    };
    let mut calls = Vec::new();
    let mut failed = false;
    let error = snapshot
        .apply(&xml(&value()), true, &mut |args| {
            calls.push(args.iter().map(|v| v.to_string()).collect::<Vec<_>>());
            if args[0] == "bootstrap" && !failed {
                failed = true;
                return Err("registration failed".into());
            }
            Ok(())
        })
        .unwrap_err();
    assert!(error.contains("registration failed"));
    assert_eq!(std::fs::read(&path).unwrap(), original);
    assert_eq!(
        calls
            .iter()
            .map(|args| args[0].as_str())
            .collect::<Vec<_>>(),
        [
            "bootout",
            "enable",
            "bootstrap",
            "bootout",
            "enable",
            "bootstrap"
        ]
    );
    let mut calls = 0;
    assert!(snapshot
        .apply(b"new", true, &mut |_| {
            calls += 1;
            Err("cannot unload".into())
        })
        .is_err());
    assert_eq!(calls, 1);
    assert_eq!(std::fs::read(path).unwrap(), original);
}
#[test]
fn pause_keeps_the_recurrence_without_loading_or_running_the_job() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("audit.plist");
    let value = value();
    let bytes = xml(&value);
    let snapshot = Snapshot {
        path: path.clone(),
        bytes: bytes.clone(),
        value,
        label: "org.example.audit".into(),
        domain: "gui/501".into(),
        loaded: true,
        enabled: true,
        requires_admin: false,
    };
    let mut calls = Vec::new();
    snapshot
        .apply(&bytes, false, &mut |args| {
            calls.push(args[0].to_owned());
            Ok(())
        })
        .unwrap();
    assert_eq!(calls, ["bootout", "disable"]);
    assert_eq!(std::fs::read(path).unwrap(), bytes);
}
#[test]
fn run_at_load_jobs_remain_editable_without_executing_during_save_or_rollback() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("audit.plist");
    let mut value = value();
    value["RunAtLoad"] = true.into();
    assert!(draft(&value, "Audit", true).is_some());
    let bytes = xml(&value);
    std::fs::write(&path, &bytes).unwrap();
    let snapshot = Snapshot {
        path: path.clone(),
        bytes: bytes.clone(),
        value: value.clone(),
        label: "org.example.audit".into(),
        domain: "gui/501".into(),
        loaded: true,
        enabled: true,
        requires_admin: false,
    };
    value["StartInterval"] = 1200.into();
    let next = xml(&value);
    let mut loaded_intervals = Vec::new();
    snapshot
        .apply(&next, true, &mut |args| {
            if args[0] == "bootstrap" {
                let live: Value =
                    serde_json::to_value(plist::Value::from_file(&path).unwrap()).unwrap();
                assert_eq!(live["RunAtLoad"], false);
                loaded_intervals.push(live["StartInterval"].as_u64().unwrap());
            }
            assert_ne!(args[0], "kickstart");
            Ok(())
        })
        .unwrap();
    assert_eq!(loaded_intervals, [1200]);
    assert_eq!(std::fs::read(&path).unwrap(), next);
    let mut failed = false;
    assert!(snapshot
        .apply(&next, true, &mut |args| {
            if args[0] == "bootstrap" {
                let live: Value =
                    serde_json::to_value(plist::Value::from_file(&path).unwrap()).unwrap();
                assert_eq!(live["RunAtLoad"], false);
                if !failed {
                    failed = true;
                    return Err("cannot register".into());
                }
                assert_eq!(live["StartInterval"], 600);
            }
            Ok(())
        })
        .is_err());
    assert_eq!(std::fs::read(&path).unwrap(), bytes);
}
