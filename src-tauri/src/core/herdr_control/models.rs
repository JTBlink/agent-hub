use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SessionInfo {
    pub name: String,
    pub running: bool,
    #[serde(default)]
    pub default: bool,
    #[serde(default, skip_serializing)]
    pub socket_path: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Workspace {
    pub workspace_id: String,
    pub label: String,
    pub active_tab_id: String,
    #[serde(default)]
    pub worktree: Option<Value>,
    #[serde(default)]
    pub directory: Option<String>,
    #[serde(default)]
    pub branch: Option<String>,
    #[serde(default)]
    pub repository_icon: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Tab {
    pub tab_id: String,
    pub workspace_id: String,
    pub label: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Pane {
    pub pane_id: String,
    pub workspace_id: String,
    pub tab_id: String,
    pub terminal_id: String,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub focused: bool,
    #[serde(default)]
    pub revision: u64,
    #[serde(default)]
    pub agent_status: String,
    #[serde(default)]
    pub agent: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub agent_session: Option<Value>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Snapshot {
    pub version: String,
    #[serde(default)]
    pub workspaces: Vec<Workspace>,
    #[serde(default)]
    pub tabs: Vec<Tab>,
    #[serde(default)]
    pub panes: Vec<Pane>,
    #[serde(default)]
    pub agents: Vec<Pane>,
    #[serde(default)]
    pub layouts: Vec<Layout>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Target {
    pub session: String,
    pub workspace_id: String,
    pub pane_id: String,
    pub terminal_id: String,
    #[serde(default)]
    pub revision: u64,
    #[serde(default)]
    pub agent_session: Option<Value>,
}
impl Target {
    pub fn from_pane(session: &str, pane: &Pane) -> Self {
        Self {
            session: session.into(),
            workspace_id: pane.workspace_id.clone(),
            pane_id: pane.pane_id.clone(),
            terminal_id: pane.terminal_id.clone(),
            revision: pane.revision,
            agent_session: pane.agent_session.clone(),
        }
    }
}
#[derive(Serialize)]
pub struct OpenedWorkspace {
    pub project_id: String,
    pub path: String,
    pub target: Target,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Read,
    Prompt,
    Interrupt,
    NewTab,
    SplitRight,
    SplitDown,
    Zoom,
    Close,
}
#[derive(Serialize)]
pub struct ActionResult {
    pub output: Option<String>,
    pub target: Option<Target>,
}
#[derive(Deserialize)]
pub struct NewAgent {
    pub kind: String,
    pub name: String,
    pub direction: String,
    pub prompt: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Layout {
    pub tab_id: String,
    pub zoomed: bool,
}
#[derive(Serialize)]
pub struct StartedAgent {
    pub target: Target,
    pub warning: Option<String>,
}
