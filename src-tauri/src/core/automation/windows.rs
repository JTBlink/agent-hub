use super::AutomationTask;
#[cfg(windows)]
use super::{process::read_command, AutomationOverview};
use serde_json::Value;

#[cfg(windows)]
pub(super) fn collect(report: &mut AutomationOverview) {
    report.collect(
        "windows",
        read_command(
            "powershell.exe",
            &["-NoProfile", "-NonInteractive", "-Command", QUERY],
        )
        .and_then(|text| parse(&text)),
    );
}

#[cfg(windows)]
const QUERY: &str = r#"
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$tasks = @(Get-ScheduledTask | ForEach-Object {
  $t = $_
  $info = $null
  try { $info = $t | Get-ScheduledTaskInfo } catch {}
  [pscustomobject]@{
    name = $t.TaskName; path = ($t.TaskPath + $t.TaskName); state = [string]$t.State
    schedule = (@($t.Triggers | ForEach-Object { ($_.CimClass.CimClassName + ' ' + $_.StartBoundary + ' ' + $_.Repetition.Interval).Trim() }) -join '; ')
    command = (@($t.Actions | ForEach-Object { ($_.Execute + ' ' + $_.Arguments).Trim() }) -join '; ')
    project = (@($t.Actions | ForEach-Object { $_.WorkingDirectory } | Where-Object { $_ }) -join '; ')
    next_run = if ($info -and $info.NextRunTime.Year -gt 2000) { $info.NextRunTime.ToString('o') } else { $null }
    last_run = if ($info -and $info.LastRunTime.Year -gt 2000) { $info.LastRunTime.ToString('o') } else { $null }
    last_result = if ($info -and $info.LastRunTime.Year -gt 2000) { [string]$info.LastTaskResult } else { $null }
  }
})
ConvertTo-Json -InputObject $tasks -Depth 5 -Compress
"#;

fn parse(text: &str) -> Result<Vec<AutomationTask>, String> {
    let rows: Vec<Value> = serde_json::from_str(text.trim_start_matches('\u{feff}'))
        .map_err(|error| format!("Invalid Task Scheduler response: {error}"))?;
    rows.iter()
        .map(|row| {
            let text = |key| {
                row.get(key)
                    .and_then(Value::as_str)
                    .filter(|s| !s.is_empty())
                    .map(str::to_owned)
            };
            let path = text("path").ok_or("Task Scheduler response lacks a task path")?;
            let mut task = AutomationTask::new(
                format!("windows:{path}"),
                text("name").unwrap_or(path.clone()),
                "windows",
                path,
            );
            task.identifier = Some(task.location.clone());
            task.is_builtin = task
                .location
                .replace('/', "\\")
                .to_ascii_lowercase()
                .starts_with("\\microsoft\\windows\\");
            task.schedule = text("schedule").unwrap_or_default();
            task.command = text("command");
            task.project = text("project");
            task.status = match text("state").as_deref() {
                Some("Ready" | "Queued") => "active",
                Some("Running") => "running",
                Some("Disabled") => "paused",
                _ => "unknown",
            }
            .into();
            task.next_run = if matches!(task.status.as_str(), "paused" | "unknown") {
                None
            } else {
                text("next_run")
            };
            task.last_run = text("last_run");
            task.last_result = text("last_result");
            Ok(task)
        })
        .collect()
}

#[cfg(test)]
mod tests;
