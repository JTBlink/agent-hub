//! Shared Agent identity and caller-environment isolation for native launches.
use serde::Deserialize;

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TerminalAgent {
    Codex,
    Claude,
    ClaudeTeams,
    Opencode,
    Hermes,
}

impl TerminalAgent {
    pub fn kind(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Claude | Self::ClaudeTeams => "claude",
            Self::Opencode => "opencode",
            Self::Hermes => "hermes",
        }
    }
}

pub(crate) const INHERITED_CONTEXT: &[&str] = &[
    "HERDR_ENV",
    "HERDR_PANE_ID",
    "HERDR_TAB_ID",
    "HERDR_WORKSPACE_ID",
    "HERDR_SESSION",
    "HERDR_SOCKET",
    "HERDR_SOCKET_PATH",
    "CLAUDECODE",
    "CODEX_THREAD_ID",
    "CODEX_SESSION_ID",
    "CODEX_TOOL_CALL_ID",
];
