//! Explicit-session Herdr control; discovery never changes server lifecycle.
mod bindings;
mod focus;
mod models;
mod operations;
mod shortcuts;
mod worktree_open;
mod worktree_removal;
use anyhow::{bail, Context, Result};
pub use models::*;
use serde_json::Value;
pub use shortcuts::sidebar_keys;
use std::{
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};

static MUTATION: Mutex<()> = Mutex::new(());
pub struct HerdrControl {
    executable: PathBuf,
}
impl HerdrControl {
    pub fn new(executable: PathBuf) -> Self {
        Self { executable }
    }
    fn text(&self, session: Option<&str>, args: &[&str], timeout: u64) -> Result<String> {
        let mut command = Command::new(&self.executable);
        for key in super::session::INHERITED_CONTEXT {
            command.env_remove(key);
        }
        if let Some(session) = session {
            command.args(["--session", session]);
        }
        command.args(args);
        crate::core::cli_process::capture_prepared(command, "Herdr", timeout, None)
            .map(|v| v.0)
            .map_err(anyhow::Error::msg)
    }
    pub(crate) fn call(&self, session: Option<&str>, args: &[&str], timeout: u64) -> Result<Value> {
        let data: Value = serde_json::from_str(&self.text(session, args, timeout)?)
            .context("Invalid Herdr response; check client/server compatibility")?;
        if data.get("error").is_some() {
            bail!("Herdr rejected the request")
        }
        Ok(data.get("result").unwrap_or(&data).clone())
    }
    pub fn sessions(&self) -> Result<Vec<SessionInfo>> {
        let data = self.call(None, &["session", "list", "--json"], 5)?;
        serde_json::from_value(
            data.get("sessions")
                .cloned()
                .context("Herdr did not return its session list")?,
        )
        .map_err(Into::into)
    }
    /// Prepare the native default session without creating an app-specific session.
    pub fn prepare_session(&self) -> Result<String> {
        let cwd = std::env::current_dir()?;
        super::session::Client {
            executable: &self.executable,
            cwd: &cwd,
        }
        .ensure_server()?;
        Ok(super::session::SESSION.to_owned())
    }
    /// Restart only the explicitly selected session using the detected binary.
    pub fn restart_session(&self, session: &str) -> Result<()> {
        let _guard = MUTATION.lock().unwrap_or_else(|e| e.into_inner());
        let info = self
            .sessions()?
            .into_iter()
            .find(|s| s.name == session)
            .context("Herdr session no longer exists; refresh the sidebar")?;
        if info.running {
            let result = self.call(None, &["session", "stop", session, "--json"], 10)?;
            if result.get("stopped").and_then(Value::as_bool) != Some(true) {
                bail!("Herdr did not confirm the session was stopped")
            }
        }
        let mut command = Command::new(&self.executable);
        for key in super::session::INHERITED_CONTEXT {
            command.env_remove(key);
        }
        command
            .args(["--session", session, "server"])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        super::session::spawn_server(command)?;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        while std::time::Instant::now() < deadline {
            if self.call(Some(session), &["workspace", "list"], 1).is_ok() {
                return Ok(());
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        bail!("Herdr did not become ready after restart; refresh to inspect the session before retrying")
    }
    /// Stop and remove an explicitly selected named session. The default is retained.
    pub fn delete_session(&self, session: &str) -> Result<()> {
        let _guard = MUTATION.lock().unwrap_or_else(|e| e.into_inner());
        let info = self
            .sessions()?
            .into_iter()
            .find(|s| s.name == session)
            .context("Herdr session no longer exists; refresh the sidebar")?;
        if info.default || session == "default" {
            bail!("The default Herdr session cannot be deleted")
        }
        if info.running {
            let result = self.call(None, &["session", "stop", session, "--json"], 10)?;
            if result.get("stopped").and_then(Value::as_bool) != Some(true) {
                bail!("Herdr did not confirm the session was stopped; refresh and retry")
            }
        }
        let result = self.call(None, &["session", "delete", session, "--json"], 10)?;
        if result.get("deleted").and_then(Value::as_bool) != Some(true) {
            bail!("Herdr did not confirm session deletion; refresh and retry")
        }
        Ok(())
    }
    fn running(&self, session: &str) -> Result<()> {
        if !self
            .sessions()?
            .iter()
            .any(|s| s.name == session && s.running)
        {
            bail!("Herdr session is not running; open it in Herdr and refresh")
        }
        Ok(())
    }
    pub fn snapshot(&self, session: &str) -> Result<Snapshot> {
        self.running(session)?;
        let data = self.call(Some(session), &["api", "snapshot"], 8)?;
        let mut snapshot: Snapshot = serde_json::from_value(
            data.get("snapshot")
                .cloned()
                .context("Herdr snapshot is unavailable; check client/server compatibility")?,
        )?;
        for workspace in &mut snapshot.workspaces {
            workspace.directory = directory_for(workspace, &snapshot.panes)
                .ok()
                .map(|p| p.to_string_lossy().into_owned());
            workspace.repository_icon = workspace
                .directory
                .as_deref()
                .and_then(|p| git2::Repository::open(p).ok())
                .map(|repo| {
                    let remote = repo.find_remote("origin").ok();
                    let url = remote.as_ref().and_then(|r| r.url()).unwrap_or("");
                    let host = if let Some((_, rest)) = url.split_once("://") {
                        rest.split('/')
                            .next()
                            .unwrap_or("")
                            .rsplit('@')
                            .next()
                            .unwrap_or("")
                    } else {
                        url.split(':')
                            .next()
                            .unwrap_or("")
                            .rsplit('@')
                            .next()
                            .unwrap_or("")
                    };
                    match host {
                        "github.com" => "github",
                        "gitlab.com" => "gitlab",
                        _ => "git",
                    }
                    .to_owned()
                });
            workspace.branch = workspace
                .directory
                .as_deref()
                .and_then(|p| git2::Repository::open(p).ok())
                .and_then(|r| r.head().ok().and_then(|h| h.shorthand().map(str::to_owned)));
        }
        Ok(snapshot)
    }
    pub fn open(
        &self,
        store: &crate::core::skill_store::SkillStore,
        session: &str,
        workspace_id: &str,
        pane_id: Option<&str>,
    ) -> Result<OpenedWorkspace> {
        let _guard = MUTATION.lock().unwrap_or_else(|e| e.into_inner());
        self.open_locked(store, session, workspace_id, pane_id)
    }
    fn open_locked(
        &self,
        store: &crate::core::skill_store::SkillStore,
        session: &str,
        workspace_id: &str,
        pane_id: Option<&str>,
    ) -> Result<OpenedWorkspace> {
        let snapshot = self.snapshot(session)?;
        let workspace = snapshot
            .workspaces
            .iter()
            .find(|w| w.workspace_id == workspace_id)
            .context("Herdr workspace no longer exists; refresh the sidebar")?;
        let directory = directory_for(workspace, &snapshot.panes)?;
        let pane = snapshot
            .panes
            .iter()
            .filter(|p| p.workspace_id == workspace_id)
            .find(|p| {
                pane_id.map_or(p.focused && p.tab_id == workspace.active_tab_id, |id| {
                    p.pane_id == id
                })
            })
            .or_else(|| {
                if pane_id.is_none() {
                    snapshot.panes.iter().find(|p| {
                        p.workspace_id == workspace_id && p.tab_id == workspace.active_tab_id
                    })
                } else {
                    None
                }
            })
            .context("Herdr pane no longer exists; refresh the sidebar")?;
        let project_id = bindings::resolve_project(store, &directory)?;
        self.focus(session, &snapshot, pane)?;
        Ok(OpenedWorkspace {
            project_id,
            path: directory.to_string_lossy().into_owned(),
            target: Target::from_pane(session, pane),
        })
    }
    fn focus(&self, session: &str, snapshot: &Snapshot, pane: &Pane) -> Result<()> {
        self.call(
            Some(session),
            &["workspace", "focus", &pane.workspace_id],
            5,
        )?;
        self.call(Some(session), &["tab", "focus", &pane.tab_id], 5)?;
        if snapshot.agents.iter().any(|a| a.pane_id == pane.pane_id) {
            self.call(Some(session), &["agent", "focus", &pane.pane_id], 5)?;
        } else if !pane.focused {
            self.focus_pane(session, &pane.pane_id)?;
        }
        Ok(())
    }
    pub fn ensure(
        &self,
        store: &crate::core::skill_store::SkillStore,
        session: &str,
        project_id: &str,
        path: Option<&str>,
    ) -> Result<OpenedWorkspace> {
        let _guard = MUTATION.lock().unwrap_or_else(|e| e.into_inner());
        let directory = crate::core::project_worktrees::directory(store, project_id, path)?;
        let snapshot = self.snapshot(session)?;
        if let Some(w) = snapshot.workspaces.iter().find(|w| {
            w.directory
                .as_deref()
                .is_some_and(|p| Path::new(p) == directory)
        }) {
            return self.open_locked(store, session, &w.workspace_id, None);
        }
        let label = directory
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or("workspace");
        let created = self.call(
            Some(session),
            &[
                "workspace",
                "create",
                "--cwd",
                directory
                    .to_str()
                    .context("Workspace path must be Unicode")?,
                "--label",
                label,
                "--no-focus",
            ],
            10,
        )?;
        let id = created
            .pointer("/workspace/workspace_id")
            .and_then(Value::as_str)
            .context("Herdr did not return the created workspace")?;
        self.open_locked(store, session, id, None)
    }
    pub fn attachment(
        &self,
        store: &crate::core::skill_store::SkillStore,
        project_id: &str,
        path: &str,
        target: &Target,
    ) -> Result<portable_pty::CommandBuilder> {
        let _guard = MUTATION.lock().unwrap_or_else(|e| e.into_inner());
        let directory = crate::core::project_worktrees::directory(store, project_id, Some(path))?;
        let snapshot = self.snapshot(&target.session)?;
        let workspace = snapshot
            .workspaces
            .iter()
            .find(|w| w.workspace_id == target.workspace_id)
            .context("Workspace was closed")?;
        if directory_for(workspace, &snapshot.panes)? != directory {
            bail!("Herdr target no longer belongs to the selected checkout")
        }
        // The client attaches to a workspace, whereas saved pane/terminal IDs
        // can expire when a pane is closed. Re-resolve only for attachment;
        // explicit actions must continue to use verify's exact identity fence.
        let pane = self
            .verify(&snapshot, target, false)
            .ok()
            .or_else(|| {
                snapshot
                    .panes
                    .iter()
                    .filter(|p| {
                        p.workspace_id == workspace.workspace_id
                            && p.tab_id == workspace.active_tab_id
                    })
                    .max_by_key(|p| p.focused)
            })
            .context("Herdr workspace has no available pane; refresh the sidebar")?;
        self.focus(&target.session, &snapshot, pane)?;
        let mut command = portable_pty::CommandBuilder::new(&self.executable);
        command.args(["session", "attach", &target.session]);
        for key in super::session::INHERITED_CONTEXT {
            command.env_remove(key);
        }
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        Ok(command)
    }
}
fn directory_for(workspace: &Workspace, panes: &[Pane]) -> Result<PathBuf> {
    if let Some(path) = workspace
        .worktree
        .as_ref()
        .and_then(|v| v.get("checkout_path"))
        .and_then(Value::as_str)
    {
        return checked_directory(path);
    }
    let mut directories = Vec::new();
    for path in panes
        .iter()
        .filter(|p| p.workspace_id == workspace.workspace_id)
        .filter_map(|p| p.cwd.as_deref())
    {
        let path = checked_directory(path)?;
        if !directories.contains(&path) {
            directories.push(path)
        }
    }
    if directories.len() != 1 {
        bail!("Herdr workspace has no unambiguous directory; open a dedicated workspace for this checkout")
    }
    Ok(directories.remove(0))
}
fn checked_directory(path: &str) -> Result<PathBuf> {
    let path = Path::new(path);
    if !path.is_absolute() {
        bail!("Herdr returned a non-absolute workspace directory")
    }
    let path = path
        .canonicalize()
        .context("Workspace directory is unavailable; restore it and refresh")?;
    if !path.is_dir() {
        bail!("Workspace directory is unavailable")
    };
    Ok(path)
}
