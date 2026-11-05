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
        let current = self.api(binding, endpoint.clone(), &cancel)?;
        if current.get("pull_request").is_some() {
            return Err(TaskFailure::new(
                "invalid_input",
                "Issue actions cannot change a pull request",
            ));
        }
        let item = match binding.provider {
            #[cfg(feature = "github")]
            Provider::Github => crate::core::platforms::github::tasks::update_issue(
                self, binding, number, change, current, endpoint, &cancel,
            )?,
            #[cfg(feature = "gitlab")]
            Provider::Gitlab => crate::core::platforms::gitlab::tasks::update_issue(
                self, binding, number, change, current, endpoint, &cancel,
            )?,
            #[cfg(not(feature = "github"))]
            Provider::Github => {
                binding.provider.require()?;
                current
            }
            #[cfg(not(feature = "gitlab"))]
            Provider::Gitlab => {
                binding.provider.require()?;
                current
            }
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
