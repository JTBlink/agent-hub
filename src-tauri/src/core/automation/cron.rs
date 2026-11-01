use super::AutomationTask;
#[cfg(unix)]
use super::{process::read_command, AutomationOverview};

#[cfg(unix)]
pub(super) fn collect(report: &mut AutomationOverview) {
    match read_command("crontab", &["-l"]) {
        Ok(text) => report.tasks.extend(parse(&text, "crontab", false)),
        Err(error) if error.to_lowercase().contains("no crontab") => {}
        Err(error) => report.issue("cron", error),
    }
    #[cfg(target_os = "linux")]
    {
        read_system_file(std::path::Path::new("/etc/crontab"), report);
        match std::fs::read_dir("/etc/cron.d") {
            Ok(entries) => {
                for entry in entries {
                    match entry {
                        Ok(entry)
                            if entry.path().is_file()
                                && cron_file_name(&entry.file_name().to_string_lossy()) =>
                        {
                            read_system_file(&entry.path(), report)
                        }
                        Ok(_) => {}
                        Err(error) => report.issue("cron", error.to_string()),
                    }
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => report.issue("cron", error.to_string()),
        }
    }
}

#[cfg(any(target_os = "linux", test))]
fn cron_file_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}

#[cfg(target_os = "linux")]
fn read_system_file(path: &std::path::Path, report: &mut AutomationOverview) {
    match std::fs::read_to_string(path) {
        Ok(text) => report
            .tasks
            .extend(parse(&text, &path.to_string_lossy(), true)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => report.issue("cron", format!("{}: {error}", path.display())),
    }
}

fn parse(text: &str, location: &str, system: bool) -> Vec<AutomationTask> {
    text.lines()
        .enumerate()
        .filter_map(|(index, line)| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let parts: Vec<&str> = line.split_whitespace().collect();
            // Environment assignments are not tasks. '=' is valid inside a command.
            if parts.first()?.contains('=') {
                return None;
            }
            let fields = if line.starts_with('@') { 1 } else { 5 };
            let start = fields + usize::from(system);
            if parts.len() <= start {
                return None;
            }
            // Preserve quoting and internal whitespace in the actual command.
            let mut command = line;
            for _ in 0..start {
                command = command[command.find(char::is_whitespace)?..].trim_start();
            }
            let command = command.to_owned();
            let mut task = AutomationTask::new(
                format!("cron:{location}:{index}"),
                command.clone(),
                "cron",
                location.into(),
            );
            task.is_builtin = system && builtin_maintenance(location, &command);
            task.schedule = parts[..fields].join(" ");
            // A crontab entry alone cannot establish that the cron daemon is running.
            task.command = Some(command);
            Some(task)
        })
        .collect()
}

fn builtin_maintenance(location: &str, command: &str) -> bool {
    if location == "/etc/crontab" {
        return [
            "/etc/cron.hourly",
            "/etc/cron.daily",
            "/etc/cron.weekly",
            "/etc/cron.monthly",
        ]
        .iter()
        .any(|directory| command.contains(directory));
    }
    let path = std::path::Path::new(location);
    path.parent() == Some(std::path::Path::new("/etc/cron.d"))
        && path.file_name().is_some_and(|name| {
            [
                "anacron",
                "0hourly",
                "e2scrub_all",
                "sysstat",
                "popularity-contest",
                "mdadm",
                "raid-check",
                "logrotate",
            ]
            .iter()
            .any(|builtin| name == *builtin)
        })
}

#[cfg(test)]
mod tests;
