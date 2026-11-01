use super::{
    adapter, Binding, CliReader, IssueAction, IssueStateChange, Provider, TaskClient, TaskComment,
    TaskFailure, TaskKind, TaskSummary,
};
use std::sync::atomic::AtomicBool;

impl<R: CliReader> TaskClient<R> {
    /// State mutations always use the persisted binding, never a caller-supplied URL.
    pub fn update_issue(
        &self,
        binding: &Binding,
        number: u64,
        change: &IssueStateChange,
    ) -> Result<TaskSummary, TaskFailure> {
        binding.validate()?;
        if number == 0
            || (matches!(change.action, IssueAction::Duplicate)
                && (change.duplicate_of.is_none()
                    || change.duplicate_of == Some(0)
                    || change.duplicate_of == Some(number)))
        {
            return Err(TaskFailure::new(
                "invalid_input",
                "Choose a different issue number in this repository",
            ));
        }
        if binding.provider == Provider::Gitlab
            && !matches!(change.action, IssueAction::Open | IssueAction::Closed)
        {
            return Err(TaskFailure::new(
                "invalid_input",
                "This provider supports opening and closing issues without a close reason",
            ));
        }
        let cancel = AtomicBool::new(false);
        let endpoint = adapter::object_endpoint(binding, TaskKind::Issue, number);
        let mut current = self.api(binding, endpoint.clone(), &cancel)?;
        if current.get("pull_request").is_some() {
            return Err(TaskFailure::new(
                "invalid_input",
                "Issue actions cannot change a pull request",
            ));
        }
        let item = if binding.provider == Provider::Github
            && matches!(change.action, IssueAction::Duplicate)
        {
            let duplicate = self.api(
                binding,
                adapter::object_endpoint(
                    binding,
                    TaskKind::Issue,
                    change.duplicate_of.unwrap_or_default(),
                ),
                &cancel,
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
            let response = self.request(binding, "POST", "graphql".into(), &[
                ("query", "mutation($id:ID!,$target:ID!){closeIssue(input:{issueId:$id,stateReason:DUPLICATE,duplicateIssueId:$target}){issue{state stateReason updatedAt closedAt}}}".into()),
                ("id", id.into()), ("target", target.into()),
            ], &cancel)?;
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
            current
        } else {
            let open = matches!(change.action, IssueAction::Open);
            let fields = if binding.provider == Provider::Github {
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
                fields
            } else {
                vec![("state_event", if open { "reopen" } else { "close" }.into())]
            };
            self.request(
                binding,
                if binding.provider == Provider::Github {
                    "PATCH"
                } else {
                    "PUT"
                },
                endpoint,
                &fields,
                &cancel,
            )?
        };
        let summary = adapter::summary(binding, TaskKind::Issue, &item)?;
        let expected_open = matches!(change.action, IssueAction::Open);
        if summary.number != number
            || (expected_open && !matches!(summary.state.as_str(), "open" | "opened"))
            || (!expected_open && summary.state != "closed")
        {
            return Err(TaskFailure::new(
                "invalid_response",
                "Platform did not confirm the requested issue state",
            ));
        }
        Ok(summary)
    }

    pub fn add_comment(
        &self,
        binding: &Binding,
        kind: TaskKind,
        number: u64,
        body: &str,
    ) -> Result<TaskComment, TaskFailure> {
        binding.validate()?;
        if number == 0 || body.trim().is_empty() || body.len() > 65536 || body.contains('\0') {
            return Err(TaskFailure::new(
                "invalid_input",
                "Enter a non-empty comment within the platform size limit",
            ));
        }
        let response = self.request(
            binding,
            "POST",
            adapter::comments_endpoint(binding, kind, number),
            &[("body", body.into())],
            &AtomicBool::new(false),
        )?;
        let comment = adapter::comment(binding.provider, &response);
        if comment.id == 0 {
            return Err(TaskFailure::new(
                "invalid_response",
                "Platform did not confirm comment creation; refresh before retrying",
            ));
        }
        Ok(comment)
    }
}
