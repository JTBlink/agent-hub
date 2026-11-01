//! Interactive Agent startup belongs to Herdr, independent of the terminal UI.
use anyhow::{bail, Context, Result};
use serde_json::Value;
use std::{
    path::Path,
    process::{Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};
pub(crate) const SESSION: &str = "agent-hub-agents";
static SERVER_START: Mutex<()> = Mutex::new(());
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

pub(crate) struct Client<'a> {
    pub executable: &'a Path,
    pub cwd: &'a Path,
}

fn isolate(command: &mut Command) {
    for name in INHERITED_CONTEXT {
        command.env_remove(name);
    }
}

impl Client<'_> {
    pub fn command(&self) -> Command {
        let mut command = Command::new(self.executable);
        command.args(["--session", SESSION]).current_dir(self.cwd);
        isolate(&mut command);
        command
    }

    pub fn call(&self, args: &[&str], timeout: u64) -> Result<Value> {
        let mut command = self.command();
        command.args(args);
        let (output, _) = super::cli_process::capture_prepared(command, "Herdr", timeout, None)
            .map_err(anyhow::Error::msg)?;
        let value: Value = serde_json::from_str(&output).context("Invalid Herdr response")?;
        Ok(value.get("result").unwrap_or(&value).clone())
    }

    pub fn ensure_server(&self) -> Result<()> {
        let _guard = SERVER_START
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let sessions = self.call(&["session", "list", "--json"], 5)?;
        if sessions["sessions"].as_array().is_some_and(|sessions| {
            sessions
                .iter()
                .any(|session| session["name"] == SESSION && session["running"] == true)
        }) {
            return Ok(());
        }
        let mut server = self.command();
        server
            .arg("server")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            server.process_group(0);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            server.creation_flags(0x08000000);
        }
        let mut child = server
            .spawn()
            .context("Cannot start the AgentHub Herdr session")?;
        // The daemon owns its lifetime; closing a terminal only detaches its client.
        std::thread::spawn(move || {
            let _ = child.wait();
        });
        let deadline = Instant::now() + Duration::from_secs(8);
        while Instant::now() < deadline {
            if self.call(&["workspace", "list"], 1).is_ok() {
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        bail!("Herdr session agent-hub-agents did not become ready; open it in Herdr and retry")
    }
}

use serde::Deserialize;
use std::path::PathBuf;

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HerdrAgent {
    Codex,
    Claude,
    ClaudeTeams,
    Opencode,
    Hermes,
}

impl HerdrAgent {
    fn kind(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Claude | Self::ClaudeTeams => "claude",
            Self::Opencode => "opencode",
            Self::Hermes => "hermes",
        }
    }

    fn arguments(self) -> &'static [&'static str] {
        match self {
            Self::Codex => &[
                "--dangerously-bypass-approvals-and-sandbox",
                "-c",
                "check_for_update_on_startup=false",
            ],
            Self::Claude | Self::ClaudeTeams => &["--dangerously-skip-permissions"],
            Self::Opencode => &["--auto"],
            Self::Hermes => &["--yolo"],
        }
    }
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
    if super::tool_detection::find_command(agent.kind()).is_none() {
        bail!(
            "{} is not installed; install its CLI and retry",
            agent.kind()
        );
    }
    prepare_available(executable, cwd, agent)
}

fn prepare_available(executable: &Path, cwd: &Path, agent: HerdrAgent) -> Result<PreparedAgent> {
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
        let mut start = vec![
            "agent",
            "start",
            &self.name,
            "--kind",
            self.agent.kind(),
            "--pane",
            &self.pane,
            "--",
        ];
        start.extend(self.agent.arguments().iter().copied());
        if client.call(&start, 40).is_err()
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
