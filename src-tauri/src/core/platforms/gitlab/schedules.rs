use crate::core::{
    platforms::schedules::{
        field, RepositorySchedule, RepositorySchedules, ScheduleRule, MAX_PAGES,
    },
    task_browser::{Binding, CliReader, TaskClient, TaskFailure},
};
use serde_json::{json, Value};
use std::sync::atomic::AtomicBool;

pub(crate) fn list<R: CliReader>(
    cli: &TaskClient<R>,
    binding: &Binding,
    cancel: &AtomicBool,
) -> Result<RepositorySchedules, TaskFailure> {
    match list_graphql(cli, binding, cancel) {
        Err(error) if error.kind == "invalid_response" || error.kind == "network" => {
            list_rest(cli, binding, cancel)
        }
        result => result,
    }
}

fn list_rest<R: CliReader>(
    cli: &TaskClient<R>,
    binding: &Binding,
    cancel: &AtomicBool,
) -> Result<RepositorySchedules, TaskFailure> {
    let endpoint = format!(
        "projects/{}/pipeline_schedules",
        urlencoding::encode(&binding.repository)
    );
    let root = format!("https://{}/{}", binding.host, binding.repository);
    let mut result = RepositorySchedules::default();
    for page in 1..=MAX_PAGES {
        let response = cli.api(
            binding,
            format!("{endpoint}?per_page=100&page={page}"),
            cancel,
        )?;
        let schedules = response.as_array().ok_or_else(|| {
            TaskFailure::new(
                "invalid_response",
                "GitLab pipeline schedules are unavailable",
            )
        })?;
        for item in schedules {
            let id = item["id"].as_u64().ok_or_else(|| {
                TaskFailure::new("invalid_response", "GitLab schedule has no valid ID")
            })?;
            let cron = field(item, "cron").ok_or_else(|| {
                TaskFailure::new("invalid_response", "GitLab schedule has no Cron expression")
            })?;
            let run = match cli.api(
                binding,
                format!("{endpoint}/{id}/pipelines?per_page=1"),
                cancel,
            ) {
                Ok(response) => response[0].clone(),
                Err(error) if error.kind == "cancelled" => return Err(error),
                Err(_) => {
                    result.limited = true;
                    Value::Null
                }
            };
            let target = field(item, "ref").map(|value| {
                value
                    .strip_prefix("refs/heads/")
                    .or_else(|| value.strip_prefix("refs/tags/"))
                    .unwrap_or(&value)
                    .to_owned()
            });
            result.items.push(RepositorySchedule {
                id: id.to_string(),
                title: field(item, "description").unwrap_or_else(|| format!("#{id}")),
                rules: vec![ScheduleRule {
                    cron,
                    timezone: field(item, "cron_timezone"),
                }],
                target,
                active: item["active"].as_bool(),
                last_status: field(&run, "status"),
                last_run_url: run["id"]
                    .as_u64()
                    .map(|id| format!("{root}/-/pipelines/{id}")),
                next_run_at: field(item, "next_run_at"),
                owner: field(&item["owner"], "name"),
                url: format!("{root}/-/pipeline_schedules"),
            });
        }
        if schedules.len() < 100 {
            return Ok(result);
        }
    }
    result.limited = true;
    Ok(result)
}

fn list_graphql<R: CliReader>(
    cli: &TaskClient<R>,
    binding: &Binding,
    cancel: &AtomicBool,
) -> Result<RepositorySchedules, TaskFailure> {
    let mut after = Value::Null;
    let mut items = Vec::new();
    let repository = json!(binding.repository);
    for _ in 0..MAX_PAGES {
        let query = format!(
            "{{ project(fullPath: {repository}) {{ pipelineSchedules(first: 100, after: {after}) {{ nodes {{ id description cron cronTimezone active refForDisplay nextRunAt owner {{ name }} lastPipeline {{ id status }} }} pageInfo {{ hasNextPage endCursor }} }} }} }}"
        );
        let response = cli.request(
            binding,
            "POST",
            "graphql".into(),
            &[("query", query)],
            cancel,
        )?;
        let connection = &response["data"]["project"]["pipelineSchedules"];
        let nodes = connection["nodes"].as_array().ok_or_else(|| {
            TaskFailure::new(
                "invalid_response",
                "GitLab pipeline schedules are unavailable",
            )
        })?;
        for item in nodes {
            items.push(schedule(binding, item)?);
        }
        if connection["pageInfo"]["hasNextPage"].as_bool() != Some(true) {
            return Ok(RepositorySchedules {
                items,
                limited: false,
            });
        }
        let next = &connection["pageInfo"]["endCursor"];
        if !next.is_string() || next == &after {
            return Err(TaskFailure::new(
                "invalid_response",
                "GitLab returned an invalid schedule cursor",
            ));
        }
        after = next.clone();
    }
    Ok(RepositorySchedules {
        items,
        limited: true,
    })
}

fn numeric_id(value: &Value, prefix: &str) -> Option<u64> {
    value.as_str()?.strip_prefix(prefix)?.parse().ok()
}

fn schedule(binding: &Binding, item: &Value) -> Result<RepositorySchedule, TaskFailure> {
    let id = numeric_id(&item["id"], "gid://gitlab/Ci::PipelineSchedule/")
        .ok_or_else(|| TaskFailure::new("invalid_response", "GitLab schedule has no valid ID"))?;
    let root = format!("https://{}/{}", binding.host, binding.repository);
    let last_run = &item["lastPipeline"];
    let cron = field(item, "cron").ok_or_else(|| {
        TaskFailure::new("invalid_response", "GitLab schedule has no Cron expression")
    })?;
    Ok(RepositorySchedule {
        id: id.to_string(),
        title: field(item, "description").unwrap_or_else(|| format!("#{id}")),
        rules: vec![ScheduleRule {
            cron,
            timezone: field(item, "cronTimezone"),
        }],
        target: field(item, "refForDisplay"),
        active: item["active"].as_bool(),
        last_status: field(last_run, "status").map(|status| status.to_ascii_lowercase()),
        last_run_url: numeric_id(&last_run["id"], "gid://gitlab/Ci::Pipeline/")
            .map(|number| format!("{root}/-/pipelines/{number}")),
        next_run_at: field(item, "nextRunAt"),
        owner: field(&item["owner"], "name"),
        url: format!("{root}/-/pipeline_schedules"),
    })
}
