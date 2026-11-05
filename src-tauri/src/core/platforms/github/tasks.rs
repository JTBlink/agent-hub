use crate::core::task_browser::{Binding, Filters, TaskKind, PAGE_SIZE};
fn encode(value: &str) -> String {
    urlencoding::encode(value).into_owned()
}
pub(crate) fn query(
    binding: &Binding,
    filters: &Filters,
    page: u32,
    author: Option<&str>,
    assignee: Option<&str>,
) -> String {
    let kind = if filters.kind == TaskKind::Issue {
        "issue"
    } else {
        "pr"
    };
    let mut query = format!("repo:{} is:{kind}", binding.repository);
    match filters.state.as_str() {
        "draft" => query.push_str(" is:open draft:true"),
        "merged" => query.push_str(" is:merged"),
        "closed" if filters.kind == TaskKind::Review => query.push_str(" is:closed -is:merged"),
        "all" => {}
        state => query.push_str(&format!(" state:{state}")),
    }
    for (key, value) in [("author", author), ("assignee", assignee)] {
        if let Some(value) = value {
            query.push_str(&format!(
                " {key}:{}",
                serde_json::to_string(value).unwrap_or_default()
            ));
        }
    }
    for label in &filters.labels {
        query.push_str(&format!(
            " label:{}",
            serde_json::to_string(label).unwrap_or_default()
        ));
    }
    if !filters.text.trim().is_empty() {
        query.push_str(&format!(
            " {}",
            serde_json::to_string(filters.text.trim()).unwrap_or_default()
        ));
    }
    format!(
        "search/issues?q={}&sort=updated&order=desc&per_page={PAGE_SIZE}&page={page}",
        encode(&query)
    )
}

use crate::core::task_browser::development::{array, link, optional, review};
use crate::core::task_browser::{metadata, TaskCheck, TaskDevelopment, TaskFailure};
use serde_json::Value;
pub(crate) fn development(
    info: &mut TaskDevelopment,
    kind: TaskKind,
    endpoint: &str,
    item: &Value,
    read: &mut impl FnMut(String) -> Result<Value, TaskFailure>,
) -> Result<(), TaskFailure> {
    let issues_endpoint = if kind == TaskKind::Review {
        endpoint.replacen("/pulls/", "/issues/", 1)
    } else {
        endpoint.into()
    };
    let data = optional(
        info,
        "related",
        format!("{issues_endpoint}/timeline?per_page=100&page=1"),
        read,
    )?;
    for event in array(info, "related", data) {
        if let Some(item) = event.pointer("/source/issue") {
            if let Some(link) = link(
                item,
                if item.get("pull_request").is_some() {
                    "review"
                } else {
                    "issue"
                },
            ) {
                info.related.push(link);
            }
        }
    }
    if kind == TaskKind::Review {
        platform_review(info, endpoint, item, read)?;
    }
    Ok(())
}
fn platform_review(
    info: &mut TaskDevelopment,
    endpoint: &str,
    item: &Value,
    read: &mut impl FnMut(String) -> Result<Value, TaskFailure>,
) -> Result<(), TaskFailure> {
    for resource in ["reviews", "comments"] {
        let data = optional(
            info,
            "reviews",
            format!("{endpoint}/{resource}?per_page=100&page=1"),
            read,
        )?;
        let reviews = array(info, "reviews", data);
        info.reviews.extend(reviews.iter().map(review));
    }
    if let Some(sha) = metadata::text(&item["head"]["sha"]) {
        let reference = urlencoding::encode(&sha);
        let repo = endpoint
            .rsplit_once("/pulls/")
            .map(|value| value.0)
            .unwrap_or_default();
        for (resource, field) in [("check-runs", "check_runs"), ("status", "statuses")] {
            let data = optional(
                info,
                "checks",
                format!("{repo}/commits/{reference}/{resource}?per_page=100&page=1"),
                read,
            )?;
            let data = data.map(|value| value[field].clone());
            for check in array(info, "checks", data) {
                info.checks.push(TaskCheck {
                    name: metadata::text(&check["name"])
                        .or_else(|| metadata::text(&check["context"]))
                        .unwrap_or_else(|| "CI".into()),
                    status: metadata::text(&check["conclusion"])
                        .or_else(|| metadata::text(&check["status"]))
                        .or_else(|| metadata::text(&check["state"]))
                        .unwrap_or_default(),
                    url: metadata::text(&check["html_url"])
                        .or_else(|| metadata::text(&check["details_url"]))
                        .or_else(|| metadata::text(&check["target_url"]))
                        .unwrap_or_default(),
                    sha: Some(sha.clone()),
                });
            }
        }
    }
    Ok(())
}

use crate::core::task_browser::{CliReader, IssueAction, IssueStateChange, TaskClient};
use std::sync::atomic::AtomicBool;
pub(crate) fn update_issue<R: CliReader>(
    client: &TaskClient<R>,
    binding: &Binding,
    _number: u64,
    change: &IssueStateChange,
    mut current: Value,
    endpoint: String,
    cancel: &AtomicBool,
) -> Result<Value, TaskFailure> {
    if matches!(change.action, IssueAction::Duplicate) {
        let duplicate = client.api(
            binding,
            crate::core::task_browser::adapter::object_endpoint(
                binding,
                TaskKind::Issue,
                change.duplicate_of.unwrap_or_default(),
            ),
            cancel,
        )?;
        if duplicate.get("pull_request").is_some() {
            return Err(TaskFailure::new(
                "invalid_input",
                "The duplicate target must be an issue",
            ));
        }
        let id = current["node_id"].as_str().ok_or_else(|| {
            TaskFailure::new("invalid_response", "Issue node identity is missing")
        })?;
        let target = duplicate["node_id"].as_str().ok_or_else(|| {
            TaskFailure::new(
                "invalid_response",
                "Duplicate issue node identity is missing",
            )
        })?;
        let response = client.request(binding, "POST", "graphql".into(), &[
                ("query", "mutation($id:ID!,$target:ID!){closeIssue(input:{issueId:$id,stateReason:DUPLICATE,duplicateIssueId:$target}){issue{state stateReason updatedAt closedAt}}}".into()),
                ("id", id.into()), ("target", target.into()),
            ], cancel)?;
        let result = &response["data"]["closeIssue"]["issue"];
        if response["errors"]
            .as_array()
            .is_some_and(|errors| !errors.is_empty())
            || result["state"] != "CLOSED"
        {
            return Err(TaskFailure::new(
                "mutation_failed",
                response["errors"][0]["message"]
                    .as_str()
                    .unwrap_or("Platform did not confirm the state change"),
            ));
        }
        current["state"] = "closed".into();
        current["state_reason"] = "duplicate".into();
        current["updated_at"] = result["updatedAt"].clone();
        current["closed_at"] = result["closedAt"].clone();
        Ok(current)
    } else {
        let open = matches!(change.action, IssueAction::Open);
        let mut fields = vec![("state", if open { "open" } else { "closed" }.into())];
        if !open {
            fields.push((
                "state_reason",
                if matches!(change.action, IssueAction::NotPlanned) {
                    "not_planned"
                } else {
                    "completed"
                }
                .into(),
            ));
        }
        client.request(binding, "PATCH", endpoint, &fields, cancel)
    }
}
