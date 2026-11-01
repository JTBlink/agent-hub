//! Project workspace routing shared by Herdr shortcuts and Agent launchers.
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

/// Select the current project's workspace before attaching an interactive client.
pub(crate) fn prepare_workspace(executable: &Path, cwd: &Path) -> Result<Vec<String>> {
    let cwd = cwd
        .canonicalize()
        .context("Project directory is unavailable")?;
    let client = Client {
        executable,
        cwd: &cwd,
    };
    client.ensure_server()?;
    let listed = client.call(&["workspace", "list"], 5)?;
    let workspaces = listed["workspaces"]
        .as_array()
        .context("Herdr did not return workspaces")?;
    let same_path = |value: &Value| {
        value
            .as_str()
            .is_some_and(|path| Path::new(path).canonicalize().is_ok_and(|path| path == cwd))
    };
    let mut selected = workspaces
        .iter()
        .find(|workspace| same_path(&workspace["worktree"]["checkout_path"]))
        .and_then(|workspace| workspace["workspace_id"].as_str())
        .map(str::to_owned);
    if selected.is_none()
        && workspaces
            .iter()
            .any(|workspace| workspace["worktree"].is_null())
    {
        let panes = client.call(&["pane", "list"], 5)?;
        selected = panes["panes"]
            .as_array()
            .context("Herdr did not return panes")?
            .iter()
            .find(|pane| {
                same_path(&pane["cwd"])
                    && workspaces.iter().any(|workspace| {
                        workspace["worktree"].is_null()
                            && workspace["workspace_id"] == pane["workspace_id"]
                    })
            })
            .and_then(|pane| pane["workspace_id"].as_str())
            .map(str::to_owned);
    }
    let workspace = match selected {
        Some(workspace) => workspace,
        None => {
            let path = cwd
                .to_str()
                .context("Project directory is not valid Unicode")?;
            let label = cwd
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("Project");
            let created = client.call(
                &[
                    "workspace",
                    "create",
                    "--cwd",
                    path,
                    "--label",
                    label,
                    "--no-focus",
                ],
                10,
            )?;
            created["workspace"]["workspace_id"]
                .as_str()
                .context("Herdr did not return the new workspace")?
                .to_owned()
        }
    };
    client.call(&["workspace", "focus", &workspace], 5)?;
    Ok(vec!["--session".into(), SESSION.into()])
}

#[cfg(test)]
mod tests;
