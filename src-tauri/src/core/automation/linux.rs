use super::AutomationTask;
#[cfg(target_os = "linux")]
use super::{process::read_command, AutomationOverview};
use std::collections::HashMap;

#[cfg(target_os = "linux")]
pub(super) fn collect(report: &mut AutomationOverview) {
    for user in [false, true] {
        let scope = if user { "user" } else { "system" };
        let mut units = std::collections::BTreeSet::new();
        // Installed files include disabled timers; loaded units also include transient timers.
        for operation in ["list-unit-files", "list-units"] {
            let mut args = vec!["--no-pager", "--plain", "--all"];
            if user {
                args.push("--user");
            }
            args.extend([operation, "--type=timer", "--no-legend"]);
            match read_command("systemctl", &args) {
                Ok(text) => units.extend(
                    text.lines()
                        .filter_map(|line| line.split_whitespace().next())
                        .filter(|name| name.ends_with(".timer") && !name.contains("@."))
                        .map(str::to_owned),
                ),
                Err(error) => report.issue("systemd", format!("{scope}: {error}")),
            }
        }
        let units: Vec<_> = units.into_iter().collect();
        // Batch small groups rather than exceeding the operating system's argv limit.
        for batch in units.chunks(100) {
            let mut args = vec!["--no-pager"];
            if user {
                args.push("--user");
            }
            args.extend(["show", "--property=Id,Description,ActiveState,UnitFileState,TimersCalendar,TimersMonotonic,NextElapseUSecRealtime,LastTriggerUSec,FragmentPath"]);
            args.push("--");
            args.extend(batch.iter().map(String::as_str));
            report.collect(
                "systemd",
                read_command("systemctl", &args).map(|text| parse(&text, scope)),
            );
        }
    }
}

fn parse(text: &str, scope: &str) -> Vec<AutomationTask> {
    text.trim()
        .split("\n\n")
        .filter_map(|block| {
            let properties: HashMap<_, _> = block
                .lines()
                .filter_map(|line| line.split_once('='))
                .collect();
            let id = *properties.get("Id")?;
            if !id.ends_with(".timer") {
                return None;
            }
            let get = |key| {
                properties
                    .get(key)
                    .filter(|v| !v.is_empty() && **v != "n/a")
                    .map(|v| v.to_string())
            };
            let mut task = AutomationTask::new(
                format!("systemd:{scope}:{id}"),
                get("Description").unwrap_or(id.into()),
                "systemd",
                get("FragmentPath").unwrap_or(format!("{scope}/{id}")),
            );
            task.identifier = Some(id.to_string());
            task.is_builtin = scope == "system"
                && ["/usr/lib/systemd/system", "/lib/systemd/system"]
                    .iter()
                    .any(|root| std::path::Path::new(&task.location).starts_with(root));
            task.schedule = [get("TimersCalendar"), get("TimersMonotonic")]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .join(" ; ");
            task.status = match properties.get("ActiveState").copied() {
                Some("active") => "active",
                Some("failed") => "error",
                Some("inactive") => "paused",
                _ => "unknown",
            }
            .into();
            task.next_run = if task.status == "active" {
                get("NextElapseUSecRealtime")
            } else {
                None
            };
            task.last_run = get("LastTriggerUSec");
            Some(task)
        })
        .collect()
}

#[cfg(test)]
mod tests;
