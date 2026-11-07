use serde::{Deserialize, Serialize};

pub use crate::core::platforms::contracts::{CliLauncher, Provider};
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Binding {
    pub id: String,
    pub project_id: String,
    pub provider: Provider,
    pub host: String,
    pub repository: String,
    pub launcher: Option<CliLauncher>,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskKind {
    #[default]
    Issue,
    Review,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Filters {
    pub kind: TaskKind,
    pub state: String,
    pub text: String,
    pub personal: String,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub assignee: Option<String>,
    #[serde(default)]
    pub labels: Vec<String>,
}
impl Default for Filters {
    fn default() -> Self {
        Self {
            kind: TaskKind::Issue,
            state: "open".into(),
            text: String::new(),
            personal: "all".into(),
            author: None,
            assignee: None,
            labels: Vec::new(),
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TaskSummary {
    pub key: String,
    pub binding_id: String,
    pub project_id: String,
    pub provider: Provider,
    pub host: String,
    pub repository: String,
    pub kind: TaskKind,
    pub number: u64,
    pub title: String,
    pub state: String,
    pub updated_at: String,
    pub assignees: Vec<String>,
    pub url: String,
    #[serde(default)]
    pub metadata: TaskMetadata,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct TaskMetadata {
    pub state_reason: Option<String>,
    pub author: Option<String>,
    pub labels: Vec<String>,
    pub milestone: Option<String>,
    pub created_at: Option<String>,
    pub closed_at: Option<String>,
    pub due_date: Option<String>,
    pub comment_count: Option<u64>,
    pub task_count: Option<u64>,
    pub completed_tasks: Option<u64>,
    pub priority: Option<String>,
    pub severity: Option<String>,
    pub weight: Option<u64>,
    pub issue_type: Option<String>,
    pub confidential: Option<bool>,
    pub locked: Option<bool>,
    pub estimated_seconds: Option<u64>,
    pub spent_seconds: Option<u64>,
    pub review: Option<ReviewMetadata>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct ReviewMetadata {
    pub source_branch: Option<String>,
    pub target_branch: Option<String>,
    pub head_sha: Option<String>,
    pub draft: Option<bool>,
    pub merge_status: Option<String>,
    pub has_conflicts: Option<bool>,
    pub discussions_resolved: Option<bool>,
    pub additions: Option<u64>,
    pub deletions: Option<u64>,
    pub changed_files: Option<u64>,
    pub commits: Option<u64>,
    pub changes_count: Option<String>,
    pub merged_by: Option<String>,
    pub merged_at: Option<String>,
    pub reviewers: Vec<String>,
    pub pipeline: Option<TaskCheck>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TaskCheck {
    pub name: String,
    pub status: String,
    pub url: String,
    pub sha: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TaskReview {
    pub author: String,
    pub state: String,
    pub body: String,
    pub url: String,
    pub submitted_at: Option<String>,
    pub path: Option<String>,
    pub line: Option<u64>,
    pub resolved: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TaskLink {
    pub title: String,
    pub url: String,
    pub kind: String,
    pub number: Option<u64>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
pub struct TaskDevelopment {
    pub reviews: Vec<TaskReview>,
    pub checks: Vec<TaskCheck>,
    pub related: Vec<TaskLink>,
    pub files: Vec<TaskChangedFile>,
    pub commits: Vec<TaskCommit>,
    pub approvals_required: Option<u64>,
    pub approvals_left: Option<u64>,
    pub warnings: Vec<String>,
    pub truncated: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TaskChangedFile {
    pub path: String,
    pub status: String,
    pub additions: Option<u64>,
    pub deletions: Option<u64>,
    pub patch: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TaskCommit {
    pub sha: String,
    pub message: String,
    pub author: String,
    pub created_at: Option<String>,
    pub url: String,
}
#[derive(Debug, Serialize)]
pub struct TaskPage {
    pub items: Vec<TaskSummary>,
    pub identity: String,
    pub has_more: bool,
    pub limited: bool,
}
#[derive(Debug, Deserialize, Serialize)]
pub struct TaskComment {
    pub id: u64,
    pub author: String,
    pub body: String,
    pub updated_at: String,
}
#[derive(Debug, Serialize)]
pub struct TaskDetail {
    pub summary: TaskSummary,
    pub body: String,
    pub comments: Vec<TaskComment>,
    pub has_more_comments: bool,
    pub development: TaskDevelopment,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TaskFailure {
    pub kind: String,
    pub message: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum IssueAction {
    Open,
    Closed,
    Completed,
    NotPlanned,
    Duplicate,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct IssueStateChange {
    pub action: IssueAction,
    pub duplicate_of: Option<u64>,
}
impl std::fmt::Display for TaskFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}
impl std::error::Error for TaskFailure {}
impl TaskFailure {
    pub fn new(kind: &str, message: impl Into<String>) -> Self {
        Self {
            kind: kind.into(),
            message: message.into(),
        }
    }
    pub(crate) fn cli(message: String) -> Self {
        let lower = message.to_ascii_lowercase();
        let kind = if lower.contains("cancelled") {
            "cancelled"
        } else if lower.contains("rate limit") || lower.contains("429") {
            "rate_limit"
        } else if lower.contains("401")
            || lower.contains("auth login")
            || lower.contains("not logged")
        {
            "authentication"
        } else if lower.contains("403") || lower.contains("404") {
            "permission"
        } else {
            "network"
        };
        Self::new(kind, message)
    }
}
impl From<anyhow::Error> for TaskFailure {
    fn from(error: anyhow::Error) -> Self {
        Self::new("invalid_input", error.to_string())
    }
}
