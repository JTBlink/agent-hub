use super::super::{
    definition::{AutomationDraft, ManagedAutomation, Schedule},
    store,
};
use std::path::{Path, PathBuf};

pub(super) fn shell(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}
pub(super) fn ps(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}
fn xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
fn unit(value: &str) -> String {
    format!(
        "\"{}\"",
        value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('%', "%%")
            .replace('\n', "\\n")
            .replace('\r', "\\r")
    )
}

pub(super) fn scripts(
    dir: &Path,
    draft: &AutomationDraft,
    id: &str,
    replace: bool,
) -> Result<PathBuf, String> {
    let mut draft = draft.clone();
    draft.validate()?;
    let draft = &draft;
    for name in ["command.sh", "command.ps1", "run.sh", "run.ps1", "runs"] {
        let path = dir.join(name);
        if path.is_symlink() {
            return Err("Automation runner paths cannot be symbolic links".into());
        }
    }
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let workdir = draft
        .workdir
        .clone()
        .or_else(|| draft.script_dir.clone())
        .or_else(|| dirs::home_dir().map(|p| p.to_string_lossy().into_owned()))
        .ok_or("Cannot resolve working directory")?;
    let payload = super::payload::write(dir, draft, id, replace)?;
    let scripts_dir = draft.scripts_dir().unwrap_or(&workdir);
    let wrapper = dir.join(if cfg!(windows) { "run.ps1" } else { "run.sh" });
    let script = if cfg!(windows) {
        super::run_script::powershell_script(dir, &workdir, &payload, scripts_dir)
    } else {
        super::run_script::shell_script(dir, &workdir, &payload, scripts_dir)
    };
    store::write(&wrapper, script.as_bytes())?;
    Ok(wrapper)
}

pub(super) fn launchd(task: &ManagedAutomation, wrapper: &Path) -> Result<Vec<u8>, String> {
    let mut fields = plist::Dictionary::new();
    fields.insert("Label".into(), task.identifier.clone().into());
    fields.insert("Comment".into(), task.draft.name.clone().into());
    fields.insert(
        "ProgramArguments".into(),
        plist::Value::Array(vec![
            "/bin/sh".into(),
            wrapper.to_string_lossy().into_owned().into(),
        ]),
    );
    fields.insert("RunAtLoad".into(), false.into());
    if task.draft.enabled {
        match task.draft.schedule {
            Schedule::Manual | Schedule::Custom { .. } => {}
            Schedule::Interval { minutes } => {
                fields.insert("StartInterval".into(), (u64::from(minutes) * 60).into());
            }
            Schedule::Hourly { minute } => {
                let mut calendar = plist::Dictionary::new();
                calendar.insert("Minute".into(), u64::from(minute).into());
                fields.insert(
                    "StartCalendarInterval".into(),
                    plist::Value::Dictionary(calendar),
                );
            }
            Schedule::Daily {
                hour,
                minute,
                weekdays,
            } => {
                let calendar = |day: Option<u8>| {
                    let mut d = plist::Dictionary::new();
                    d.insert("Hour".into(), u64::from(hour).into());
                    d.insert("Minute".into(), u64::from(minute).into());
                    if let Some(day) = day {
                        d.insert("Weekday".into(), u64::from(day).into());
                    }
                    plist::Value::Dictionary(d)
                };
                fields.insert(
                    "StartCalendarInterval".into(),
                    if weekdays {
                        plist::Value::Array((1..=5).map(|d| calendar(Some(d))).collect())
                    } else {
                        calendar(None)
                    },
                );
            }
        }
    }
    let mut bytes = Vec::new();
    plist::Value::Dictionary(fields)
        .to_writer_xml(&mut bytes)
        .map_err(|e| e.to_string())?;
    Ok(bytes)
}

pub(super) fn systemd_service(wrapper: &Path) -> String {
    format!(
        "[Unit]\nDescription=AgentHub automation\n[Service]\nType=oneshot\nExecStart=/bin/sh {}\n",
        unit(&wrapper.to_string_lossy())
    )
}
pub(super) fn systemd_timer(task: &ManagedAutomation) -> String {
    let trigger = match task.draft.schedule {
        Schedule::Manual | Schedule::Custom { .. } => String::new(),
        Schedule::Interval { minutes } => {
            format!("OnActiveSec={minutes}min\nOnUnitInactiveSec={minutes}min\n")
        }
        Schedule::Hourly { minute } => format!("OnCalendar=*-*-* *:{minute:02}:00\n"),
        Schedule::Daily {
            hour,
            minute,
            weekdays,
        } => format!(
            "OnCalendar={}*-*-* {hour:02}:{minute:02}:00\n",
            if weekdays { "Mon..Fri " } else { "" }
        ),
    };
    format!("[Unit]\nDescription=AgentHub automation\n[Timer]\n{trigger}AccuracySec=1s\n[Install]\nWantedBy=timers.target\n")
}

pub(super) fn windows(task: &ManagedAutomation, wrapper: &Path, sid: &str) -> String {
    let mut trigger = String::new();
    if task.draft.enabled {
        let date = chrono::Local::now()
            .date_naive()
            .format("%Y-%m-%d")
            .to_string();
        trigger = match task.draft.schedule {
            Schedule::Manual | Schedule::Custom { .. } => String::new(),
            Schedule::Interval { minutes } => format!("<TimeTrigger><Repetition><Interval>PT{minutes}M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition><StartBoundary>{}</StartBoundary><Enabled>true</Enabled></TimeTrigger>", (chrono::Local::now() + chrono::Duration::minutes(i64::from(minutes))).format("%Y-%m-%dT%H:%M:%S")),
            Schedule::Hourly { minute } => format!("<TimeTrigger><Repetition><Interval>PT1H</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition><StartBoundary>{}</StartBoundary><Enabled>true</Enabled></TimeTrigger>", next_hourly(chrono::Local::now().naive_local(), minute).format("%Y-%m-%dT%H:%M:%S")),
            Schedule::Daily { hour, minute, weekdays } => format!("<CalendarTrigger><StartBoundary>{date}T{hour:02}:{minute:02}:00</StartBoundary><Enabled>true</Enabled>{}</CalendarTrigger>", if weekdays { "<ScheduleByWeek><WeeksInterval>1</WeeksInterval><DaysOfWeek><Monday/><Tuesday/><Wednesday/><Thursday/><Friday/></DaysOfWeek></ScheduleByWeek>" } else { "<ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>" }),
        };
    }
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?><Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><RegistrationInfo><Description>{}</Description></RegistrationInfo><Triggers>{trigger}</Triggers><Principals><Principal id="Author"><UserId>{sid}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals><Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>false</StartWhenAvailable><Enabled>true</Enabled><ExecutionTimeLimit>PT0S</ExecutionTimeLimit></Settings><Actions Context="Author"><Exec><Command>powershell.exe</Command><Arguments>-NoProfile -NonInteractive -ExecutionPolicy Bypass -File &quot;{}&quot;</Arguments></Exec></Actions></Task>"#,
        xml(&task.draft.name),
        xml(&wrapper.to_string_lossy())
    )
}

fn next_hourly(now: chrono::NaiveDateTime, minute: u8) -> chrono::NaiveDateTime {
    use chrono::Timelike;
    let target = now
        .date()
        .and_hms_opt(now.hour(), u32::from(minute), 0)
        .expect("validated hourly minute");
    if target <= now {
        target + chrono::Duration::hours(1)
    } else {
        target
    }
}

#[cfg(test)]
mod tests {
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
        assert!(windows(&task, Path::new("run.ps1"), "S-1-5-21-1000")
            .contains("<Interval>PT1H</Interval>"));
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
}
