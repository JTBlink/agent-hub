//! Interactive Agent startup belongs to Herdr, independent of the terminal UI.
mod configured;
use super::session::{Client, INHERITED_CONTEXT, SESSION};
use anyhow::{bail, Context, Result};
use std::path::{Path, PathBuf};

pub use crate::core::agent_runtime::TerminalAgent as HerdrAgent;

/// Herdr-specific managed lifecycle; installed once by the matching CLI.
pub(crate) fn execution_module() -> Result<PathBuf> {
    crate::core::python_support::publish("herdr_execution", include_str!("../agent_execution.py"))
}

/// Attach to the new Herdr terminal before its Agent has become ready.
pub struct AgentAttachment {
    pub executable: PathBuf,
    pub arguments: Vec<String>,
}

/// Terminal preparation and Agent readiness have separate lifecycles.
pub struct PreparedAgent {
    pub attachment: AgentAttachment,
    pub startup: AgentStartup,
}

pub struct AgentStartup {
    executable: PathBuf,
    cwd: PathBuf,
    agent: HerdrAgent,
    launch: crate::core::agent_launch_config::Launch,
    pane: String,
    name: String,
}

impl AgentAttachment {
    pub fn command(self) -> portable_pty::CommandBuilder {
        let mut command = portable_pty::CommandBuilder::new(self.executable);
        command.args(self.arguments);
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        for name in INHERITED_CONTEXT {
            command.env_remove(name);
        }
        command
    }
}

/// Start an interactive YOLO Agent in an explicitly selected, validated directory.
/// Callers retain ownership of project validation and the attachment's PTY.
pub fn prepare(executable: &Path, cwd: &Path, agent: HerdrAgent) -> Result<PreparedAgent> {
    let launch = crate::core::agent_launch_config::resolve(agent.kind())?;
    if crate::core::tool_detection::resolve_program(&launch.program, cwd).is_none() {
        bail!(
            "{} is not installed; install its CLI and retry",
            agent.kind()
        );
    }
    prepare_available(executable, cwd, agent)
}

fn prepare_available(executable: &Path, cwd: &Path, agent: HerdrAgent) -> Result<PreparedAgent> {
    let launch = crate::core::agent_launch_config::resolve(agent.kind())?;
    let client = Client { executable, cwd };
    client.ensure_server()?;
    let mut workspace = vec!["workspace", "create", "--cwd"];
    let path = cwd
        .to_str()
        .context("Project directory is not valid Unicode")?;
    workspace.extend([path, "--label", agent.kind(), "--no-focus"]);
    if matches!(agent, HerdrAgent::ClaudeTeams) {
        workspace.extend(["--env", "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1"]);
    }
    let created = client.call(&workspace, 10)?;
    let pane = created["root_pane"]["pane_id"]
        .as_str()
        .context("Herdr did not return the new pane")?;
    let terminal = created["root_pane"]["terminal_id"]
        .as_str()
        .context("Herdr did not return the new terminal")?;
    let name = format!("hub-{}", &uuid::Uuid::new_v4().simple().to_string()[..16]);
    Ok(PreparedAgent {
        attachment: AgentAttachment {
            executable: executable.into(),
            arguments: ["--session", SESSION, "terminal", "attach", terminal]
                .into_iter()
                .map(str::to_string)
                .collect(),
        },
        startup: AgentStartup {
            executable: executable.into(),
            cwd: cwd.into(),
            agent,
            launch,
            pane: pane.into(),
            name,
        },
    })
}

impl AgentStartup {
    /// Herdr starts the canonical Agent executable; no prompt is submitted.
    /// Run after attaching the PTY so native initialization errors remain visible.
    pub fn start(self) -> Result<()> {
        let client = Client {
            executable: &self.executable,
            cwd: &self.cwd,
        };
        if configured::start(&self.launch, &self.name, &self.pane, |args, timeout| {
            client.call(args, timeout)
        })
        .is_err()
            && client.call(&["agent", "get", &self.name], 5).is_err()
        {
            // Never repeat a start whose outcome is uncertain. The terminal
            // remains attached, including early CLI exits and login dialogs.
            bail!(
                "{} did not become ready; see its terminal output for the startup error",
                self.agent.kind()
            );
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;

/// Start one configured Agent in an explicit session/pane. No prompt is submitted here.
pub fn start_configured(
    executable: &Path,
    session: &str,
    launch: &crate::core::agent_launch_config::Launch,
    name: &str,
    pane: &str,
) -> Result<serde_json::Value> {
    let control = super::control::HerdrControl::new(executable.into());
    configured::start(launch, name, pane, |args, timeout| {
        control.call(Some(session), args, timeout)
    })
}
