use super::{Binding, Filters, Provider, TaskFailure, TaskKind, PAGE_SIZE};

pub(super) fn validate(binding: &Binding, filters: &Filters, page: u32) -> Result<(), TaskFailure> {
    binding.validate()?;
    let invalid_value = |value: &str| value.len() > 256 || value.contains(['\0', '\r', '\n']);
    if page == 0
        || page > 1000
        || invalid_value(&filters.text)
        || !matches!(
            filters.state.as_str(),
            "open" | "closed" | "merged" | "draft" | "all"
        )
        || (filters.kind == TaskKind::Issue && matches!(filters.state.as_str(), "merged" | "draft"))
        || !matches!(filters.personal.as_str(), "all" | "assigned" | "created")
        || filters.author.as_deref().is_some_and(invalid_value)
        || filters.assignee.as_deref().is_some_and(invalid_value)
        || filters.labels.len() > 20
        || filters
            .labels
            .iter()
            .any(|label| label.is_empty() || invalid_value(label))
        || (binding.provider == Provider::Github && page > 40)
    {
        return Err(TaskFailure::new(
            "invalid_input",
            "Unsupported task query or page",
        ));
    }
    if binding.provider == Provider::Gitlab
        && filters
            .labels
            .iter()
            .any(|label| label.contains(',') || matches!(label.as_str(), "Any" | "None"))
    {
        return Err(TaskFailure::new(
            "invalid_input",
            "GitLab cannot filter these literal label names",
        ));
    }
    Ok(())
}

fn encode(value: &str) -> String {
    urlencoding::encode(value).into_owned()
}

fn resolve_user<'a>(value: Option<&'a str>, personal: bool, username: &'a str) -> Option<&'a str> {
    value
        .filter(|value| !value.trim().is_empty())
        .map(|value| if value == "@me" { username } else { value })
        .or_else(|| personal.then_some(username))
}

pub(super) fn endpoint(binding: &Binding, filters: &Filters, page: u32, username: &str) -> String {
    let author = resolve_user(
        filters.author.as_deref(),
        filters.personal == "created",
        username,
    );
    let assignee = resolve_user(
        filters.assignee.as_deref(),
        filters.personal == "assigned",
        username,
    );
    match binding.provider {
        Provider::Github => {
            let kind = if filters.kind == TaskKind::Issue {
                "issue"
            } else {
                "pr"
            };
            let mut query = format!("repo:{} is:{kind}", binding.repository);
            match filters.state.as_str() {
                "draft" => query.push_str(" is:open draft:true"),
                "merged" => query.push_str(" is:merged"),
                "closed" if filters.kind == TaskKind::Review => {
                    query.push_str(" is:closed -is:merged")
                }
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
        Provider::Gitlab => {
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
    }
}
