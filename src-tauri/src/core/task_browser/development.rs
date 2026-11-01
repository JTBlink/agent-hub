//! Optional development information. Failure never discards a readable task.
use super::{
    metadata, Provider, TaskCheck, TaskDevelopment, TaskFailure, TaskKind, TaskLink, TaskReview,
};
use serde_json::Value;

fn optional(
    info: &mut TaskDevelopment,
    section: &str,
    endpoint: String,
    read: &mut impl FnMut(String) -> Result<Value, TaskFailure>,
) -> Result<Option<Value>, TaskFailure> {
    match read(endpoint) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind == "cancelled" => Err(error),
        Err(_) => {
            if !info.warnings.iter().any(|item| item == section) {
                info.warnings.push(section.into());
            }
            Ok(None)
        }
    }
}

fn array(info: &mut TaskDevelopment, section: &str, value: Option<Value>) -> Vec<Value> {
    match value {
        Some(Value::Array(items)) => {
            if items.len() >= 100 && !info.truncated.iter().any(|item| item == section) {
                info.truncated.push(section.into());
            }
            items
        }
        Some(_) => {
            info.warnings.push(section.into());
            Vec::new()
        }
        None => Vec::new(),
    }
}

fn link(item: &Value, kind: &str) -> Option<TaskLink> {
    let url = metadata::text(&item["html_url"]).or_else(|| metadata::text(&item["web_url"]))?;
    Some(TaskLink {
        title: super::adapter::string(item, "title"),
        url,
        kind: kind.into(),
        number: item["number"].as_u64().or_else(|| item["iid"].as_u64()),
    })
}

fn review(item: &Value) -> TaskReview {
    TaskReview {
        author: metadata::actor(&item["user"])
            .or_else(|| metadata::actor(&item["author"]))
            .unwrap_or_default(),
        state: metadata::text(&item["state"]).unwrap_or_else(|| "COMMENTED".into()),
        body: super::adapter::string(item, "body"),
        url: super::adapter::string(item, "html_url"),
        submitted_at: metadata::text(&item["submitted_at"])
            .or_else(|| metadata::text(&item["created_at"])),
        path: metadata::text(&item["path"])
            .or_else(|| metadata::text(&item["position"]["new_path"]))
            .or_else(|| metadata::text(&item["position"]["old_path"])),
        line: item["line"]
            .as_u64()
            .or_else(|| item["position"]["new_line"].as_u64())
            .or_else(|| item["position"]["old_line"].as_u64()),
        resolved: item["resolved"].as_bool(),
    }
}

pub(super) fn load(
    provider: Provider,
    kind: TaskKind,
    endpoint: &str,
    item: &Value,
    mut read: impl FnMut(String) -> Result<Value, TaskFailure>,
) -> Result<TaskDevelopment, TaskFailure> {
    let mut info = TaskDevelopment::default();
    if provider == Provider::Github {
        let issues_endpoint = if kind == TaskKind::Review {
            endpoint.replacen("/pulls/", "/issues/", 1)
        } else {
            endpoint.into()
        };
        let data = optional(
            &mut info,
            "related",
            format!("{issues_endpoint}/timeline?per_page=100&page=1"),
            &mut read,
        )?;
        for event in array(&mut info, "related", data) {
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
            github_review(&mut info, endpoint, item, &mut read)?;
        }
    } else {
        let resource = if kind == TaskKind::Review {
            "closes_issues"
        } else {
            "related_merge_requests"
        };
        let data = optional(
            &mut info,
            "related",
            format!("{endpoint}/{resource}?per_page=100&page=1"),
            &mut read,
        )?;
        for item in array(&mut info, "related", data) {
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
            gitlab_review(&mut info, endpoint, &mut read)?;
        }
    }
    let mut urls = std::collections::HashSet::new();
    if kind == TaskKind::Review {
        changes(&mut info, provider, endpoint, &mut read)?;
    }
    info.related.retain(|link| urls.insert(link.url.clone()));
    Ok(info)
}

fn changes(
    info: &mut TaskDevelopment,
    provider: Provider,
    endpoint: &str,
    read: &mut impl FnMut(String) -> Result<Value, TaskFailure>,
) -> Result<(), TaskFailure> {
    let resource = if provider == Provider::Github {
        "files"
    } else {
        "diffs"
    };
    let data = optional(
        info,
        "files",
        format!("{endpoint}/{resource}?per_page=100&page=1"),
        read,
    )?;
    for item in array(info, "files", data) {
        let path = metadata::text(&item["filename"])
            .or_else(|| metadata::text(&item["new_path"]))
            .or_else(|| metadata::text(&item["old_path"]));
        let Some(path) = path else {
            continue;
        };
        let patch = metadata::text(&item["patch"]).or_else(|| metadata::text(&item["diff"]));
        let patch = patch.map(|patch| {
            if patch.len() > 200_000 {
                info.truncated.push("files".into());
                patch.chars().take(50_000).collect()
            } else {
                patch
            }
        });
        info.files.push(super::TaskChangedFile {
            path,
            status: metadata::text(&item["status"]).unwrap_or_else(|| {
                if item["new_file"] == true {
                    "added"
                } else if item["deleted_file"] == true {
                    "deleted"
                } else if item["renamed_file"] == true {
                    "renamed"
                } else {
                    "modified"
                }
                .into()
            }),
            additions: item["additions"].as_u64(),
            deletions: item["deletions"].as_u64(),
            patch,
        });
    }
    let data = optional(
        info,
        "commits",
        format!("{endpoint}/commits?per_page=100&page=1"),
        read,
    )?;
    for item in array(info, "commits", data) {
        let Some(sha) = metadata::text(&item["sha"]).or_else(|| metadata::text(&item["id"])) else {
            continue;
        };
        info.commits.push(super::TaskCommit {
            sha,
            message: metadata::text(&item["commit"]["message"])
                .or_else(|| metadata::text(&item["title"]))
                .or_else(|| metadata::text(&item["message"]))
                .unwrap_or_default(),
            author: metadata::actor(&item["author"])
                .or_else(|| metadata::text(&item["author_name"]))
                .or_else(|| metadata::text(&item["commit"]["author"]["name"]))
                .unwrap_or_default(),
            created_at: metadata::text(&item["created_at"])
                .or_else(|| metadata::text(&item["commit"]["author"]["date"])),
            url: metadata::text(&item["html_url"])
                .or_else(|| metadata::text(&item["web_url"]))
                .unwrap_or_default(),
        });
    }
    Ok(())
}

fn github_review(
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

fn gitlab_review(
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
