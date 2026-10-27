use super::{AutomationOverview, AutomationTask};
use serde_json::Value;
use std::path::Path;

pub(super) fn collect(report: &mut AutomationOverview) {
    let home = std::env::var_os("HERMES_HOME")
        .filter(|v| !v.is_empty())
        .map(std::path::PathBuf::from);
    let Some(root) = home
        .clone()
        .or_else(|| dirs::home_dir().map(|p| p.join(".hermes")))
    else {
        report.issue("hermes", "Cannot resolve Hermes home".into());
        return;
    };
    read_store(&root, "default", report);
    // An explicit HERMES_HOME is a profile boundary; never read sibling profiles.
    if home.is_some() {
        return;
    }
    match std::fs::read_dir(root.join("profiles")) {
        Ok(entries) => {
            for entry in entries {
                match entry {
                    Ok(entry) if entry.file_type().is_ok_and(|kind| kind.is_dir()) => {
                        read_store(&entry.path(), &entry.file_name().to_string_lossy(), report)
                    }
                    Ok(_) => {}
                    Err(error) => report.issue("hermes", error.to_string()),
                }
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => report.issue("hermes", error.to_string()),
    }
}

fn read_store(root: &Path, profile: &str, report: &mut AutomationOverview) {
    let path = root.join("cron/jobs.json");
    match std::fs::read_to_string(&path) {
        Ok(text) => report.collect("hermes", parse(&text, profile, &path.to_string_lossy())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => report.issue("hermes", format!("{profile}: {error}")),
    }
}

fn text(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value
            .get(key)?
            .as_str()
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
    })
}

fn parse(input: &str, profile: &str, location: &str) -> Result<Vec<AutomationTask>, String> {
    let data: Value = serde_json::from_str(input.trim_start_matches('\u{feff}'))
        .map_err(|e| format!("{profile}: invalid Hermes jobs JSON: {e}"))?;
    let container = data.get("jobs").unwrap_or(&data);
    let jobs: Vec<(String, &Value)> = match container {
        Value::Array(jobs) => jobs
            .iter()
            .enumerate()
            .map(|(i, j)| (i.to_string(), j))
            .collect(),
        Value::Object(jobs) if data.get("jobs").is_some() => {
            jobs.iter().map(|(id, j)| (id.clone(), j)).collect()
        }
        _ => return Err(format!("{profile}: unrecognized Hermes jobs format")),
    };
    jobs.into_iter()
        .map(|(fallback, job)| {
            if !job.is_object() {
                return Err(format!("{profile}: invalid Hermes job record"));
            }
            let id = text(job, &["id"]).unwrap_or(fallback);
            let mut task = AutomationTask::new(
                format!("hermes:{profile}:{id}"),
                text(job, &["name"]).unwrap_or(id.clone()),
                "hermes",
                location.into(),
            );
            task.identifier = Some(id);
            task.schedule = text(job, &["schedule_display"])
                .or_else(|| text(&job["schedule"], &["expr", "value", "display"]))
                .or_else(|| job["schedule"].as_str().map(str::to_owned))
                .unwrap_or_else(|| {
                    if job["schedule"].is_object() {
                        job["schedule"].to_string()
                    } else {
                        String::new()
                    }
                });
            task.project = text(job, &["working_dir", "workdir", "cwd", "project"]);
            task.next_run = text(job, &["next_run_at"]);
            task.last_run = text(job, &["last_run_at"]);
            let state = text(job, &["state"]).unwrap_or_default();
            task.status = match state.as_str() {
                "completed" => "completed",
                "error" => "error",
                _ if job["enabled"].as_bool() == Some(false) => "paused",
                "running" => "running",
                _ => "active",
            }
            .into();
            if matches!(task.status.as_str(), "paused" | "completed" | "error") {
                task.next_run = None;
            }
            task.last_result = text(job, &["last_error", "last_status"]);
            task.prompt = text(job, &["prompt", "message"]);
            task.command = text(job, &["command", "script"]);
            // Profile identity remains visible even for otherwise identical job names.
            if profile != "default" {
                task.name = format!("{} · {profile}", task.name);
            }
            Ok(task)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_task_files_without_rewriting_them_and_keeps_partial_results() {
        let home = tempfile::tempdir().unwrap();
        let cron = home.path().join("cron");
        std::fs::create_dir(&cron).unwrap();
        let path = cron.join("jobs.json");
        let original = r#"{"jobs":[{"id":"audit","prompt":"Inspect repository","enabled":true}]}"#;
        std::fs::write(&path, original).unwrap();
        let mut report = AutomationOverview::default();
        read_store(home.path(), "default", &mut report);
        assert_eq!(report.tasks.len(), 1);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), original);
        assert_eq!(std::fs::read_dir(&cron).unwrap().count(), 1);
        std::fs::write(&path, "invalid JSON").unwrap();
        read_store(home.path(), "coder", &mut report);
        assert_eq!(report.tasks.len(), 1);
        assert_eq!(report.issues.len(), 1);
    }
    #[test]
    fn reads_disabled_and_active_jobs_and_keeps_profile_ids_distinct() {
        let input = r#"{"jobs":[{"id":"audit","name":"Audit","enabled":false,"next_run_at":"2026-11-01T09:00:00Z","schedule_display":"0 9 * * 1-5","prompt":"Inspect the repository"},{"id":"check","enabled":true,"state":"paused","schedule":{"expr":"*/10 * * * *"},"cwd":"<workspace>"}]}"#;
        let tasks = parse(input, "default", "~/demo/jobs.json").unwrap();
        assert_eq!(tasks[0].status, "paused");
        assert!(tasks[0].next_run.is_none());
        assert_eq!(tasks[1].status, "active");
        assert_eq!(tasks[1].project.as_deref(), Some("<workspace>"));
        let profile = parse(input, "coder", "~/demo/profiles/coder/jobs.json").unwrap();
        assert_ne!(tasks[0].id, profile[0].id);
        assert!(profile[0].name.ends_with("coder"));
    }
    #[test]
    fn accepts_legacy_arrays_and_id_maps_and_reports_corrupt_files() {
        assert_eq!(parse("[]", "default", "jobs.json").unwrap().len(), 0);
        assert_eq!(
            parse(
                r#"{"jobs":{"audit":{"prompt":"Audit"}}}"#,
                "default",
                "jobs.json"
            )
            .unwrap()[0]
                .name,
            "audit"
        );
        assert!(parse("broken", "default", "jobs.json").is_err());
        assert!(parse("{}", "default", "jobs.json").is_err());
    }
}
