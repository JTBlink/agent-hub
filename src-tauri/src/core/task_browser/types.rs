use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Github,
    Gitlab,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CliLauncher {
    pub program: String,
    pub args: Vec<String>,
}
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
}
impl Default for Filters {
    fn default() -> Self {
        Self {
            kind: TaskKind::Issue,
            state: "open".into(),
            text: String::new(),
            personal: "all".into(),
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
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TaskFailure {
    pub kind: String,
    pub message: String,
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
    pub(super) fn cli(message: String) -> Self {
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
