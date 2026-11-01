use super::AutomationTask;
#[cfg(target_os = "macos")]
use super::{process::read_command, AutomationOverview};
use serde_json::Value;
use std::collections::HashMap;

#[cfg(target_os = "macos")]
pub(super) fn collect(report: &mut AutomationOverview, locale: &str) {
    let mut names = super::launchd_names::Resolver::new(locale);
    let loaded = match read_command("/bin/launchctl", &["list"]) {
        Ok(text) => runtime(&text),
        Err(error) => {
            report.issue("launchd", error);
            HashMap::new()
        }
    };
    let Some(home) = dirs::home_dir() else {
        report.issue("launchd", "Cannot resolve user home".into());
        return;
    };
    let user = home.join("Library/LaunchAgents");
    let management = read_command("/usr/bin/id", &["-u"])
        .ok()
        .and_then(|uid| uid.trim().parse::<u32>().ok())
        .and_then(|uid| {
            read_command("/bin/launchctl", &["print-disabled", &format!("gui/{uid}")])
                .ok()
                .map(|text| (uid, super::external_launchd::disabled(&text)))
        });
    let system_overrides = read_command("/bin/launchctl", &["print-disabled", "system"])
        .ok()
        .map(|text| super::external_launchd::disabled(&text));
    let directories = [
        user.clone(),
        "/Library/LaunchAgents".into(),
        "/Library/LaunchDaemons".into(),
        "/System/Library/LaunchAgents".into(),
        "/System/Library/LaunchDaemons".into(),
    ];
    for directory in directories {
        let entries = match std::fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                report.issue("launchd", format!("{}: {error}", directory.display()));
                continue;
            }
        };
        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) => {
                    report.issue("launchd", error.to_string());
                    continue;
                }
            };
            let path = entry.path();
            if path.extension().map_or(true, |ext| ext != "plist") {
                continue;
            }
            match plist::Value::from_file(&path)
                .map_err(|e| e.to_string())
                .and_then(|value| {
                    // Convert through Serde so XML and binary property lists share one parser.
                    serde_json::to_value(value).map_err(|e| e.to_string())
                }) {
                Ok(value) => {
                    if let Some(mut task) = parse(
                        &value,
                        &path.to_string_lossy(),
                        if directory == user
                            || directory == std::path::Path::new("/Library/LaunchAgents")
                        {
                            Some(&loaded)
                        } else {
                            None
                        },
                        &mut names,
                    ) {
                        if directory == user {
                            if let Some((uid, overrides)) = &management {
                                super::external_launchd::decorate(
                                    &mut task, &user, *uid, overrides,
                                );
                            }
                        }
                        if directory == std::path::Path::new("/Library/LaunchAgents") {
                            if let Some((_, overrides)) = &management {
                                super::external_launchd::decorate_system(
                                    &mut task, &directory, overrides,
                                );
                            }
                        } else if directory == std::path::Path::new("/Library/LaunchDaemons") {
                            if let Some(overrides) = &system_overrides {
                                super::external_launchd::decorate_system(
                                    &mut task, &directory, overrides,
                                );
                            }
                        }
                        report.tasks.push(task);
                    }
                }
                Err(error) => report.issue("launchd", format!("{}: {error}", path.display())),
            }
        }
    }
}

pub(super) fn runtime(text: &str) -> HashMap<String, (bool, String)> {
    text.lines()
        .filter_map(|line| {
            let fields: Vec<_> = line.split_whitespace().collect();
            if fields.len() != 3 || fields[0] == "PID" {
                return None;
            }
            Some((
                fields[2].to_owned(),
                (fields[0] != "-", fields[1].to_owned()),
            ))
        })
        .collect()
}

fn calendar(value: &Value) -> Option<String> {
    value.as_object()?;
    // Preserve launchd's calendar fields: Day + Weekday are conjunctive and
    // cannot safely be presented as an equivalent five-field cron expression.
    Some(
        ["Hour", "Minute", "Day", "Month", "Weekday"]
            .iter()
            .filter_map(|key| {
                value
                    .get(key)
                    .and_then(Value::as_u64)
                    .map(|v| format!("{key}={v}"))
            })
            .collect::<Vec<_>>()
            .join(" "),
    )
}

fn parse(
    value: &Value,
    location: &str,
    loaded: Option<&HashMap<String, (bool, String)>>,
    names: &mut super::launchd_names::Resolver,
) -> Option<AutomationTask> {
    let mut schedules = Vec::new();
    if let Some(interval) = value["StartInterval"].as_u64().filter(|v| *v > 0) {
        schedules.push(format!("@every {interval}s"));
    }
    if let Some(calendars) = value["StartCalendarInterval"].as_array() {
        schedules.extend(calendars.iter().filter_map(calendar));
    } else if let Some(calendar) = calendar(&value["StartCalendarInterval"]) {
        schedules.push(calendar);
    }
    if schedules.is_empty() {
        return None;
    }
    let name = value["Label"].as_str()?.to_owned();
    let mut task = AutomationTask::new(
        format!("launchd:{location}"),
        name.clone(),
        "launchd",
        location.into(),
    );
    task.identifier = Some(name.clone());
    let presentation = names.resolve(value, &name);
    task.name = presentation.name;
    task.bundle_id = presentation.bundle_id;
    task.icon = presentation.icon;
    task.is_builtin = name.starts_with("com.apple.")
        || std::path::Path::new(location).starts_with("/System/Library");
    task.schedule = schedules.join(" ; ");
    task.project = value["WorkingDirectory"].as_str().map(str::to_owned);
    task.command = value["ProgramArguments"]
        .as_array()
        .map(|args| {
            args.iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join(" ")
        })
        .or_else(|| value["Program"].as_str().map(str::to_owned));
    if let Some((running, exit)) = loaded.and_then(|loaded| loaded.get(&name)) {
        task.status = if *running { "running" } else { "active" }.into();
        // launchctl supplies a last exit code, but no last execution timestamp.
        if exit != "0" && exit != "-" {
            task.last_result = Some(format!("exit: {exit}"));
        }
    }
    // Disabled in a plist is only a default; launchctl can override it. Without
    // runtime evidence keep the status unknown rather than guessing from that flag.
    Some(task)
}

#[cfg(test)]
mod tests;
