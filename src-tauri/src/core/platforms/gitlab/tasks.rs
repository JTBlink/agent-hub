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
    let resource = if filters.kind == TaskKind::Issue {
        "issues"
    } else {
        "merge_requests"
    };
    let state = match filters.state.as_str() {
        "open" | "draft" => "opened",
        state => state,
    };
    let mut endpoint = format!("projects/{}/{resource}?scope=all&state={state}&search={}&order_by=updated_at&sort=desc&per_page={PAGE_SIZE}&page={page}", encode(&binding.repository), encode(&filters.text));
    if filters.state == "draft" {
        endpoint.push_str("&wip=yes");
    }
    if let Some(author) = author {
        endpoint.push_str(&format!("&author_username={}", encode(author)));
    }
    if let Some(assignee) = assignee {
        endpoint.push_str(&format!("&assignee_username%5B%5D={}", encode(assignee)));
    }
    if !filters.labels.is_empty() {
        endpoint.push_str(&format!("&labels={}", encode(&filters.labels.join(","))));
    }
    endpoint
}

use crate::core::task_browser::development::{array, link, optional, review};
use crate::core::task_browser::{metadata, TaskDevelopment, TaskFailure, TaskReview};
use serde_json::Value;
pub(crate) fn development(
    info: &mut TaskDevelopment,
    kind: TaskKind,
    endpoint: &str,
    _item: &Value,
    read: &mut impl FnMut(String) -> Result<Value, TaskFailure>,
) -> Result<(), TaskFailure> {
    let resource = if kind == TaskKind::Review {
        "closes_issues"
    } else {
        "related_merge_requests"
    };
    let data = optional(
        info,
        "related",
        format!("{endpoint}/{resource}?per_page=100&page=1"),
        read,
    )?;
    for item in array(info, "related", data) {
        if let Some(link) = link(
            &item,
            if kind == TaskKind::Review {
                "closes"
            } else {
                "review"
            },
        ) {
            info.related.push(link);
        }
    }
    if kind == TaskKind::Review {
        platform_review(info, endpoint, read)?;
    }

    Ok(())
}
fn platform_review(
    info: &mut TaskDevelopment,
    endpoint: &str,
    read: &mut impl FnMut(String) -> Result<Value, TaskFailure>,
) -> Result<(), TaskFailure> {
    if let Some(value) = optional(info, "reviews", format!("{endpoint}/approvals"), read)? {
        if value.is_object() {
            info.approvals_required = value["approvals_required"].as_u64();
            info.approvals_left = value["approvals_left"].as_u64();
            if let Some(approved) = value["approved_by"].as_array() {
                info.reviews.extend(
                    approved
                        .iter()
                        .filter_map(|entry| metadata::actor(&entry["user"]))
                        .map(|author| TaskReview {
                            author,
                            state: "APPROVED".into(),
                            body: String::new(),
                            url: String::new(),
                            submitted_at: None,
                            path: None,
                            line: None,
                            resolved: None,
                        }),
                );
            }
        } else {
            info.warnings.push("reviews".into());
        }
    }
    let data = optional(
        info,
        "reviews",
        format!("{endpoint}/discussions?per_page=100&page=1"),
        read,
    )?;
    for discussion in array(info, "reviews", data) {
        if let Some(notes) = discussion["notes"].as_array() {
            for note in notes
                .iter()
                .filter(|note| note.get("position").is_some_and(Value::is_object))
            {
                info.reviews.push(review(note));
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
    _current: Value,
    endpoint: String,
    cancel: &AtomicBool,
) -> Result<Value, TaskFailure> {
    if !matches!(change.action, IssueAction::Open | IssueAction::Closed) {
        return Err(TaskFailure::new(
            "invalid_input",
            "This provider supports opening and closing issues without a close reason",
        ));
    }
    client.request(
        binding,
        "PUT",
        endpoint,
        &[(
            "state_event",
            if matches!(change.action, IssueAction::Open) {
                "reopen"
            } else {
                "close"
            }
            .into(),
        )],
        cancel,
    )
}
