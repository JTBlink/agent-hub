use crate::core::{
    platforms::schedules::{
        field, JobState, RepositorySchedule, RepositorySchedules, ScheduleProgress, ScheduleRule,
        MAX_PAGES,
    },
    task_browser::{Binding, CliReader, TaskClient, TaskFailure},
};
use serde_json::{json, Value};
use serde_yaml::Value as Yaml;

use std::{collections::HashMap, sync::atomic::AtomicBool};

pub(crate) fn list<R: CliReader>(
    cli: &TaskClient<R>,
    binding: &Binding,
    cancel: &AtomicBool,
) -> Result<RepositorySchedules, TaskFailure> {
    let (owner, repo) = binding
        .repository
        .split_once('/')
        .ok_or_else(|| TaskFailure::new("invalid_input", "GitHub repository has no owner"))?;
    // Read default-branch workflow definitions together, independent of the current checkout.
    let query = format!(
        r#"{{ repository(owner: {}, name: {}) {{ defaultBranchRef {{ name }} object(expression: "HEAD:.github/workflows") {{ ... on Tree {{ entries {{ name object {{ ... on Blob {{ text isTruncated }} }} }} }} }} }} }}"#,
        json!(owner),
        json!(repo)
    );
    let response = cli.request(
        binding,
        "POST",
        "graphql".into(),
        &[("query", query)],
        cancel,
    )?;
    let repository = response["data"]["repository"]
        .as_object()
        .ok_or_else(|| TaskFailure::new("invalid_response", "GitHub repository is unavailable"))?;
    let branch = repository
        .get("defaultBranchRef")
        .and_then(|reference| field(reference, "name"));
    let mut result = RepositorySchedules::default();
    let Some(tree) = repository.get("object").filter(|tree| !tree.is_null()) else {
        return Ok(result);
    };
    let entries = tree["entries"].as_array().ok_or_else(|| {
        TaskFailure::new(
            "invalid_response",
            "GitHub workflow directory is unavailable",
        )
    })?;
    let mut definitions = HashMap::new();
    for entry in entries {
        let Some(name) = field(entry, "name") else {
            continue;
        };
        if !name.ends_with(".yml") && !name.ends_with(".yaml") {
            continue;
        }
        let blob = &entry["object"];
        if blob["isTruncated"].as_bool() == Some(true) {
            result.limited = true;
            continue;
        }
        if let Some(text) = blob["text"].as_str() {
            match cron_rules(text) {
                Ok(rules) if !rules.is_empty() => {
                    definitions.insert(format!(".github/workflows/{name}"), rules);
                }
                Err(_) => result.limited = true,
                _ => {}
            }
        } else {
            result.limited = true;
        }
    }
    if definitions.is_empty() {
        return Ok(result);
    }
    let endpoint = format!("repos/{}/actions/workflows", binding.repository);
    for page in 1..=MAX_PAGES {
        let response = cli.api(
            binding,
            format!("{endpoint}?per_page=100&page={page}"),
            cancel,
        )?;
        let workflows = response["workflows"].as_array().ok_or_else(|| {
            TaskFailure::new("invalid_response", "GitHub workflow list is unavailable")
        })?;
        for workflow in workflows {
            let (Some(id), Some(path)) = (workflow["id"].as_u64(), workflow["path"].as_str())
            else {
                continue;
            };
            let Some(rules) = definitions.remove(path) else {
                continue;
            };
            let mut run_endpoint = format!(
                "repos/{}/actions/workflows/{id}/runs?event=schedule&per_page=1",
                binding.repository
            );
            if let Some(branch) = &branch {
                run_endpoint.push_str(&format!("&branch={}", urlencoding::encode(branch)));
            }
            let run = match cli.api(binding, run_endpoint, cancel) {
                Ok(response) => response["workflow_runs"][0].clone(),
                Err(error) if error.kind == "cancelled" => return Err(error),
                Err(_) => {
                    result.limited = true;
                    Value::Null
                }
            };
            let base = format!("https://{}/{}/actions", binding.host, binding.repository);
            let file = path.rsplit('/').next().unwrap_or(path);
            result.items.push(RepositorySchedule {
                id: id.to_string(),
                title: field(workflow, "name").unwrap_or_else(|| file.to_owned()),
                rules,
                target: branch.clone(),
                active: workflow["state"].as_str().map(|state| state == "active"),
                last_status: field(&run, "conclusion").or_else(|| field(&run, "status")),
                last_run_id: run["id"].as_u64(),
                last_run_url: run["id"].as_u64().map(|id| format!("{base}/runs/{id}")),
                next_run_at: None,
                owner: None,
                url: format!("{base}/workflows/{}", urlencoding::encode(file)),
            });
        }
        if definitions.is_empty() {
            return Ok(result);
        }
        if workflows.len() < 100 {
            break;
        }
    }
    result.limited = true;
    Ok(result)
}

fn cron_rules(text: &str) -> Result<Vec<ScheduleRule>, serde_yaml::Error> {
    let yaml: Yaml = serde_yaml::from_str(text)?;
    let mut rules = Vec::new();
    if let Some(entries) = yaml["on"]["schedule"].as_sequence() {
        for entry in entries {
            if let Some(cron) = entry["cron"]
                .as_str()
                .filter(|value| !value.trim().is_empty())
            {
                rules.push(ScheduleRule {
                    cron: cron.to_owned(),
                    timezone: Some(entry["timezone"].as_str().unwrap_or("UTC").to_owned()),
                });
            }
        }
    }
    Ok(rules)
}

pub(crate) fn progress<R: CliReader>(
    cli: &TaskClient<R>,
    binding: &Binding,
    run_id: u64,
    cancel: &AtomicBool,
) -> Result<ScheduleProgress, TaskFailure> {
    let root = format!("repos/{}/actions/runs/{run_id}", binding.repository);
    let run = cli.api(binding, root.clone(), cancel)?;
    let mut result = ScheduleProgress {
        status: field(&run, "conclusion").or_else(|| field(&run, "status")),
        ..ScheduleProgress::default()
    };
    let mut seen = std::collections::HashSet::new();
    for page in 1..=MAX_PAGES {
        let response = cli.api(
            binding,
            format!("{root}/jobs?filter=latest&per_page=100&page={page}"),
            cancel,
        )?;
        let jobs = response["jobs"].as_array().ok_or_else(|| {
            TaskFailure::new("invalid_response", "GitHub workflow jobs are unavailable")
        })?;
        for job in jobs {
            if job["id"].as_u64().is_some_and(|id| !seen.insert(id)) {
                continue;
            }
            result.record(match job["status"].as_str() {
                Some("completed") => JobState::Finished,
                Some("in_progress") => JobState::Running,
                Some("queued" | "pending" | "requested" | "waiting") => JobState::Waiting,
                _ => JobState::Unknown,
            });
        }
        if jobs.len() < 100
            || response["total_count"]
                .as_u64()
                .is_some_and(|total| result.total as u64 >= total)
        {
            return Ok(result);
        }
    }
    result.limited = true;
    Ok(result)
}
