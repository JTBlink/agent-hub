use super::{Binding, Filters, Provider, TaskFailure, TaskKind};

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
    let _ = (page, author, assignee);
    match binding.provider {
        #[cfg(feature = "github")]
        Provider::Github => {
            crate::core::platforms::github::tasks::query(binding, filters, page, author, assignee)
        }
        #[cfg(feature = "gitlab")]
        Provider::Gitlab => {
            crate::core::platforms::gitlab::tasks::query(binding, filters, page, author, assignee)
        }
        #[cfg(not(feature = "github"))]
        Provider::Github => String::new(),
        #[cfg(not(feature = "gitlab"))]
        Provider::Gitlab => String::new(),
    }
}
