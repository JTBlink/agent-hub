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
mod tests {
    use super::*;
    #[test]
    fn marks_packaged_system_timers_and_keeps_local_and_user_timers() {
        let text = "Id=cleanup.timer\nFragmentPath=/usr/lib/systemd/system/cleanup.timer\n\nId=audit.timer\nFragmentPath=/etc/systemd/system/audit.timer\n\nId=temporary.timer\nFragmentPath=/run/systemd/transient/temporary.timer\n";
        assert_eq!(
            parse(text, "system")
                .iter()
                .map(|t| t.is_builtin)
                .collect::<Vec<_>>(),
            vec![true, false, false]
        );
        assert!(parse(text, "user").iter().all(|t| !t.is_builtin));
    }
    #[test]
    fn reads_timer_properties_without_claiming_trigger_means_success() {
        let text = "Id=audit.timer\nDescription=Daily audit\nActiveState=active\nTimersCalendar={ OnCalendar=*-*-* 09:00:00 ; next_elapse=n/a }\nNextElapseUSecRealtime=Tue 2026-10-27 09:00:00 UTC\nLastTriggerUSec=Mon 2026-10-26 09:00:00 UTC\n\nId=cleanup.timer\nActiveState=inactive\nNextElapseUSecRealtime=n/a\n";
        let tasks = parse(text, "user");
        assert_eq!(tasks.len(), 2);
        assert_eq!(tasks[0].status, "active");
        assert!(tasks[0].last_result.is_none());
        assert_eq!(tasks[1].status, "paused");
        assert!(tasks[1].next_run.is_none());
        assert_ne!(tasks[0].id, parse(text, "system")[0].id);
    }
}
