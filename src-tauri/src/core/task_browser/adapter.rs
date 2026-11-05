use super::*;
pub(super) fn string(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .into()
}
fn encode(value: &str) -> String {
    urlencoding::encode(value).into_owned()
}
pub(crate) fn object_endpoint(binding: &Binding, kind: TaskKind, number: u64) -> String {
    match binding.provider {
        Provider::Github => format!(
            "repos/{}/{}/{number}",
            binding.repository,
            if kind == TaskKind::Issue {
                "issues"
            } else {
                "pulls"
            }
        ),
        Provider::Gitlab => format!(
            "projects/{}/{}/{number}",
            encode(&binding.repository),
            if kind == TaskKind::Issue {
                "issues"
            } else {
                "merge_requests"
            }
        ),
    }
}
pub(super) fn comments_endpoint(binding: &Binding, kind: TaskKind, number: u64) -> String {
    match binding.provider {
        Provider::Github => format!("repos/{}/issues/{number}/comments", binding.repository),
        Provider::Gitlab => format!("{}/notes", object_endpoint(binding, kind, number)),
    }
}
pub(super) fn summary(
    binding: &Binding,
    kind: TaskKind,
    item: &Value,
) -> std::result::Result<TaskSummary, TaskFailure> {
    let number = item
        .get(if binding.provider == Provider::Github {
            "number"
        } else {
            "iid"
        })
        .and_then(Value::as_u64)
        .filter(|number| *number > 0)
        .ok_or_else(|| {
            TaskFailure::new(
                "invalid_response",
                "Platform returned a task without an identifier",
            )
        })?;
    let provider = if binding.provider == Provider::Github {
        "github"
    } else {
        "gitlab"
    };
    let kind_name = if kind == TaskKind::Issue {
        "issue"
    } else {
        "review"
    };
    let assignees = item
        .get("assignees")
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .map(|item| {
                    string(
                        item,
                        if binding.provider == Provider::Github {
                            "login"
                        } else {
                            "username"
                        },
                    )
                })
                .filter(|name| !name.is_empty())
                .collect()
        })
        .unwrap_or_default();
    let state = if kind == TaskKind::Review
        && (item.get("merged_at").is_some_and(|value| !value.is_null())
            || item["pull_request"]["merged_at"].as_str().is_some())
    {
        "merged".into()
    } else {
        string(item, "state")
    };
    Ok(TaskSummary {
        key: format!(
            "{provider}://{}/{}/{kind_name}/{number}",
            binding.host, binding.repository
        ),
        binding_id: binding.id.clone(),
        project_id: binding.project_id.clone(),
        provider: binding.provider,
        host: binding.host.clone(),
        repository: binding.repository.clone(),
        kind,
        number,
        title: string(item, "title"),
        state,
        updated_at: string(item, "updated_at"),
        assignees,
        url: string(
            item,
            if binding.provider == Provider::Github {
                "html_url"
            } else {
                "web_url"
            },
        ),
        metadata: super::metadata::extract(binding.provider, kind, item),
    })
}
pub(super) fn page(
    binding: &Binding,
    kind: TaskKind,
    identity: &str,
    page: u32,
    response: Value,
) -> std::result::Result<TaskPage, TaskFailure> {
    let items = match binding.provider {
        Provider::Github => response.get("items").and_then(Value::as_array),
        Provider::Gitlab => response.as_array(),
    }
    .ok_or_else(|| TaskFailure::new("invalid_response", "Invalid task list response"))?;
    let total = response
        .get("total_count")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let has_more = if binding.provider == Provider::Github {
        total > page as u64 * PAGE_SIZE as u64 && page < 40
    } else {
        items.len() == PAGE_SIZE
    };
    Ok(TaskPage {
        items: items
            .iter()
            .map(|item| summary(binding, kind, item))
            .collect::<std::result::Result<_, _>>()?,
        identity: identity.into(),
        has_more,
        limited: total > 1000
            || response
                .get("incomplete_results")
                .and_then(Value::as_bool)
                .unwrap_or(false),
    })
}
pub(super) fn comment(provider: Provider, item: &Value) -> TaskComment {
    let author = item
        .get(if provider == Provider::Github {
            "user"
        } else {
            "author"
        })
        .map(|value| {
            string(
                value,
                if provider == Provider::Github {
                    "login"
                } else {
                    "username"
                },
            )
        })
        .unwrap_or_default();
    TaskComment {
        id: item.get("id").and_then(Value::as_u64).unwrap_or(0),
        author,
        body: string(item, "body"),
        updated_at: string(item, "updated_at"),
    }
}
