//! Edit current-user timed LaunchAgents in place; never claim them as AgentHub jobs.
use super::{
    definition::{AutomationDraft, Provider, Schedule},
    process::read_command,
    AutomationTask,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    os::unix::fs::MetadataExt,
    path::{Path, PathBuf},
};

pub(super) fn revision(bytes: &[u8], enabled: bool) -> u64 {
    let mut digest = Sha256::new();
    digest.update(bytes);
    digest.update([u8::from(enabled)]);
    let hash = digest.finalize();
    u64::from_be_bytes(hash[..8].try_into().expect("eight digest bytes")) >> 11
}

fn read(path: &Path, root: &Path, uid: u32) -> Result<(Vec<u8>, Value), String> {
    let metadata = std::fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if path.parent() != Some(root)
        || root.is_symlink()
        || !metadata.is_file()
        || metadata.uid() != uid
        || metadata.mode() & 0o200 == 0
        || path.extension().map_or(true, |ext| ext != "plist")
        || metadata.len() > 1024 * 1024
    {
        return Err("Only writable current-user LaunchAgents can be managed".into());
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let plist =
        plist::Value::from_reader(std::io::Cursor::new(&bytes)).map_err(|e| e.to_string())?;
    let value = serde_json::to_value(plist).map_err(|e| e.to_string())?;
    Ok((bytes, value))
}

fn schedule(value: &Value) -> Option<Schedule> {
    let interval = value.get("StartInterval");
    let calendar = value.get("StartCalendarInterval");
    if interval.is_some() && calendar.is_some() {
        return None;
    }
    if let Some(seconds) = interval.and_then(Value::as_u64) {
        return (seconds > 0 && seconds % 60 == 0 && seconds / 60 <= 525600).then_some(
            Schedule::Interval {
                minutes: (seconds / 60) as u32,
            },
        );
    }
    let calendar = calendar?;
    let daily = |item: &Value| -> Option<(u8, u8)> {
        let object = item.as_object()?;
        if object
            .keys()
            .any(|key| !["Hour", "Minute", "Weekday"].contains(&key.as_str()))
        {
            return None;
        }
        let hour = item["Hour"].as_u64()?;
        let minute = item["Minute"].as_u64()?;
        (hour < 24 && minute < 60).then_some((hour as u8, minute as u8))
    };
    if let Some(items) = calendar.as_array() {
        if items.len() != 5 {
            return None;
        }
        let (hour, minute) = daily(items.first()?)?;
        let mut days = Vec::new();
        for item in items {
            if daily(item)? != (hour, minute) {
                return None;
            }
            days.push(item["Weekday"].as_u64()?);
        }
        days.sort_unstable();
        return (days == [1, 2, 3, 4, 5]).then_some(Schedule::Daily {
            hour,
            minute,
            weekdays: true,
        });
    }
    if let Some(object) = calendar.as_object() {
        if object.len() == 1 && object.contains_key("Minute") {
            let minute = calendar["Minute"].as_u64()?;
            return (minute < 60).then_some(Schedule::Hourly {
                minute: minute as u8,
            });
        }
        if object.contains_key("Weekday") {
            return None;
        }
    }
    let (hour, minute) = daily(calendar)?;
    Some(Schedule::Daily {
        hour,
        minute,
        weekdays: false,
    })
}

fn command(value: &Value) -> Option<String> {
    let quote = |value: &str| format!("'{}'", value.replace('\'', "'\\''"));
    if let Some(args) = value["ProgramArguments"].as_array() {
        let args: Option<Vec<_>> = args.iter().map(Value::as_str).collect();
        let args = args?;
        if args.is_empty() {
            return None;
        }
        // A custom argv[0] cannot be represented faithfully by an editable shell command.
        if value
            .get("Program")
            .is_some_and(|program| program.as_str() != args.first().copied())
        {
            return None;
        }
        return Some(args.into_iter().map(quote).collect::<Vec<_>>().join(" "));
    }
    value["Program"].as_str().map(quote)
}

fn draft(value: &Value, name: &str, enabled: bool) -> Option<AutomationDraft> {
    if value
        .get("KeepAlive")
        .is_some_and(|value| value != &Value::Bool(false))
        || value
            .get("StartOnMount")
            .is_some_and(|v| v != &Value::Bool(false))
        || [
            "WatchPaths",
            "QueueDirectories",
            "Sockets",
            "MachServices",
            "LaunchEvents",
        ]
        .iter()
        .any(|key| value.get(key).is_some())
    {
        return None;
    }
    Some(AutomationDraft {
        name: name.into(),
        provider: Provider::System,
        content: command(value)?,
        workdir: value["WorkingDirectory"].as_str().map(str::to_owned),
        script_dir: None,
        schedule: schedule(value)?,
        enabled,
        files: Vec::new(),
    })
}

pub(super) fn disabled(text: &str) -> HashMap<String, bool> {
    text.lines()
        .filter_map(|line| {
            let (label, value) = line.trim().split_once(" => ")?;
            Some((
                label.strip_prefix('"')?.strip_suffix('"')?.into(),
                match value.trim().trim_end_matches(';') {
                    "true" => true,
                    "false" => false,
                    _ => return None,
                },
            ))
        })
        .collect()
}

pub(super) fn decorate(
    task: &mut AutomationTask,
    root: &Path,
    uid: u32,
    overrides: &HashMap<String, bool>,
) {
    if task.is_builtin {
        return;
    }
    let Ok((bytes, value)) = read(Path::new(&task.location), root, uid) else {
        return;
    };
    let Some(label) = task.identifier.as_deref() else {
        return;
    };
    let enabled = !overrides
        .get(label)
        .copied()
        .unwrap_or(value["Disabled"].as_bool().unwrap_or(false));
    if let Some(definition) = draft(&value, &task.name, enabled) {
        task.command = Some(definition.content.clone());
        task.definition = Some(definition);
        task.revision = Some(revision(&bytes, enabled));
        task.can_edit = true;
        task.can_run = enabled;
        if !enabled && task.status != "running" {
            task.status = "paused".into();
        }
    }
}

struct Snapshot {
    path: PathBuf,
    bytes: Vec<u8>,
    value: Value,
    label: String,
    domain: String,
    loaded: bool,
    enabled: bool,
}
fn snapshot(task: &AutomationTask) -> Result<Snapshot, String> {
    if task.source != "launchd" || task.is_builtin || !task.can_edit {
        return Err("This task is read-only".into());
    }
    let uid = read_command("/usr/bin/id", &["-u"])?;
    let uid = uid.trim().parse::<u32>().map_err(|e| e.to_string())?;
    let root = dirs::home_dir()
        .ok_or("Cannot resolve user home")?
        .join("Library/LaunchAgents");
    let path = PathBuf::from(&task.location);
    let (bytes, value) = read(&path, &root, uid)?;
    let label = value["Label"]
        .as_str()
        .ok_or("Missing launchd label")?
        .to_owned();
    if task.identifier.as_deref() != Some(&label)
        || label.is_empty()
        || label.starts_with('-')
        || label.contains(['/', '\0', '\n', '\r', '"'])
    {
        return Err("LaunchAgent identity changed; refresh before editing".into());
    }
    let domain = format!("gui/{uid}");
    let loaded = super::launchd::runtime(&read_command("/bin/launchctl", &["list"])?);
    if loaded.get(&label).is_some_and(|(running, _)| *running) {
        return Err("Wait for the current run to finish before editing".into());
    }
    if loaded.contains_key(&label) {
        let details = read_command("/bin/launchctl", &["print", &format!("{domain}/{label}")])?;
        let loaded_path = details
            .lines()
            .find_map(|line| line.trim().strip_prefix("path = "));
        if loaded_path.map(Path::new) != Some(path.as_path()) {
            return Err(
                "Loaded LaunchAgent has a different source path; manage it in its original tool"
                    .into(),
            );
        }
    }
    let overrides = disabled(&read_command(
        "/bin/launchctl",
        &["print-disabled", &domain],
    )?);
    let enabled = !overrides
        .get(&label)
        .copied()
        .unwrap_or(value["Disabled"].as_bool().unwrap_or(false));
    if draft(&value, &task.name, enabled).is_none() {
        return Err("This LaunchAgent configuration cannot be edited safely".into());
    }
    Ok(Snapshot {
        path,
        bytes,
        value,
        label: label.clone(),
        domain,
        loaded: loaded.contains_key(&label),
        enabled,
    })
}
fn ctl(args: &[&str]) -> Result<(), String> {
    read_command("/bin/launchctl", args).map(|_| ())
}
impl Snapshot {
    fn target(&self) -> String {
        format!("{}/{}", self.domain, self.label)
    }
    fn apply(
        &self,
        bytes: &[u8],
        enabled: bool,
        ctl: &mut impl FnMut(&[&str]) -> Result<(), String>,
    ) -> Result<(), String> {
        // A failed unload has made no changes; never roll it back by unloading again.
        if self.loaded {
            ctl(&["bootout", &self.target()])?;
        }
        let result = (|| {
            super::store::write(&self.path, bytes)?;
            ctl(&[if enabled { "enable" } else { "disable" }, &self.target()])?;
            if enabled {
                self.bootstrap(bytes, ctl)?;
            }
            Ok::<_, String>(())
        })();
        if let Err(error) = result {
            return Err(format!(
                "{error}; scheduler rollback: {:?}",
                self.restore(ctl)
            ));
        }
        Ok(())
    }
    /// Cache the new recurrence without running a RunAtLoad job during an edit.
    /// Restore the original on-disk flag so the next login retains its behavior.
    fn bootstrap(
        &self,
        bytes: &[u8],
        ctl: &mut impl FnMut(&[&str]) -> Result<(), String>,
    ) -> Result<(), String> {
        let value =
            plist::Value::from_reader(std::io::Cursor::new(bytes)).map_err(|e| e.to_string())?;
        let mut value = serde_json::to_value(value).map_err(|e| e.to_string())?;
        let suppress = value["RunAtLoad"].as_bool() == Some(true);
        if suppress {
            value["RunAtLoad"] = false.into();
            let mut temporary = Vec::new();
            plist::to_writer_xml(&mut temporary, &value).map_err(|e| e.to_string())?;
            super::store::write(&self.path, &temporary)?;
        }
        let result = ctl(&["bootstrap", &self.domain, &self.path.to_string_lossy()]);
        if suppress {
            super::store::write(&self.path, bytes)?;
        }
        result
    }
    fn restore(&self, ctl: &mut impl FnMut(&[&str]) -> Result<(), String>) -> Result<(), String> {
        let _ = ctl(&["bootout", &self.target()]);
        super::store::write(&self.path, &self.bytes)?;
        ctl(&[
            if self.enabled { "enable" } else { "disable" },
            &self.target(),
        ])?;
        if self.loaded {
            self.bootstrap(&self.bytes, ctl)?;
        }
        Ok(())
    }
}
fn update(
    value: &mut Value,
    draft: &AutomationDraft,
    original: &AutomationDraft,
) -> Result<Vec<u8>, String> {
    let fields = value
        .as_object_mut()
        .ok_or("Invalid LaunchAgent dictionary")?;
    fields.insert("Comment".into(), draft.name.clone().into());
    fields.insert("Disabled".into(), (!draft.enabled).into());
    if draft.content != original.content {
        fields.remove("Program");
        fields.insert(
            "ProgramArguments".into(),
            json!(["/bin/sh", "-c", draft.content]),
        );
    }
    if let Some(workdir) = &draft.workdir {
        fields.insert("WorkingDirectory".into(), workdir.clone().into());
    } else {
        fields.remove("WorkingDirectory");
    }
    if draft.schedule != original.schedule {
        fields.remove("StartInterval");
        fields.remove("StartCalendarInterval");
        match draft.schedule {
            Schedule::Interval { minutes } => {
                fields.insert("StartInterval".into(), json!(u64::from(minutes) * 60));
            }
            Schedule::Hourly { minute } => {
                fields.insert("StartCalendarInterval".into(), json!({"Minute":minute}));
            }
            Schedule::Daily {
                hour,
                minute,
                weekdays,
            } => {
                fields.insert(
                    "StartCalendarInterval".into(),
                    if weekdays {
                        Value::Array(
                            (1..=5)
                                .map(|day| json!({"Hour":hour,"Minute":minute,"Weekday":day}))
                                .collect(),
                        )
                    } else {
                        json!({"Hour":hour,"Minute":minute})
                    },
                );
            }
            _ => {
                return Err(
                    "External LaunchAgents require an interval, hourly or daily schedule".into(),
                )
            }
        }
    }
    let mut bytes = Vec::new();
    plist::to_writer_xml(&mut bytes, value).map_err(|e| e.to_string())?;
    Ok(bytes)
}

pub(super) fn save(
    task: &AutomationTask,
    expected: Option<u64>,
    draft: &AutomationDraft,
) -> Result<String, String> {
    let mut snapshot = snapshot(task)?;
    if expected != Some(revision(&snapshot.bytes, snapshot.enabled)) {
        return Err("Task changed; refresh before saving".into());
    }
    if draft.provider != Provider::System || !draft.files.is_empty() || draft.script_dir.is_some() {
        return Err("External tasks retain their original scripts; create an AgentHub task for an Agent template".into());
    }
    let original = self::draft(&snapshot.value, &task.name, snapshot.enabled)
        .ok_or("Invalid external task")?;
    let bytes = update(&mut snapshot.value, draft, &original)?;
    snapshot.apply(&bytes, draft.enabled, &mut ctl)?;
    Ok(task.id.clone())
}

pub(super) fn remove(task: &AutomationTask) -> Result<(), String> {
    let snapshot = snapshot(task)?;
    if snapshot.loaded {
        ctl(&["bootout", &snapshot.target()])?;
    }
    if let Err(error) = std::fs::remove_file(&snapshot.path) {
        return Err(format!(
            "{error}; scheduler rollback: {:?}",
            snapshot.restore(&mut ctl)
        ));
    }
    Ok(())
}
pub(super) fn run(task: &AutomationTask) -> Result<(), String> {
    let snapshot = snapshot(task)?;
    if !snapshot.enabled {
        return Err("Resume this task before running it".into());
    }
    if !snapshot.loaded {
        snapshot.bootstrap(&snapshot.bytes, &mut ctl)?;
    }
    ctl(&["kickstart", &snapshot.target()])
}

#[cfg(test)]
mod tests {
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
}
