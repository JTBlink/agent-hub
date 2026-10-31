//! Interactive PTY resources shared by desktop adapters and core callers.
mod process;
mod session;
mod shell;
use anyhow::{bail, Result};
use portable_pty::{CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use session::Session;
pub use shell::{prepare_shell, LaunchState, ShellIntegration};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
pub struct TerminalSize {
    pub rows: u16,
    pub cols: u16,
}
impl TerminalSize {
    fn pty(self) -> Result<PtySize> {
        if self.rows == 0 || self.cols == 0 || self.rows > 1000 || self.cols > 2000 {
            bail!("Terminal dimensions are outside the supported range");
        }
        Ok(PtySize {
            rows: self.rows,
            cols: self.cols,
            pixel_width: 0,
            pixel_height: 0,
        })
    }
}

pub struct TerminalSpec {
    pub project_id: String,
    pub cwd: PathBuf,
    pub command: CommandBuilder,
    pub integration: Option<ShellIntegration>,
    pub size: TerminalSize,
}

#[derive(Clone, Debug, Serialize)]
pub struct TerminalSession {
    pub id: String,
    pub project_id: String,
    pub cwd: String,
    pub exited: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TerminalEvent {
    Output { seq: u64, data: String },
    Exit { code: u32 },
    Error { message: String },
}

type Sink = Arc<dyn Fn(TerminalEvent) -> bool + Send + Sync>;
#[derive(Default)]
struct Sessions {
    items: HashMap<String, Arc<Session>>,
    pending: usize,
    shutting_down: bool,
}
#[derive(Default)]
pub struct TerminalManager {
    sessions: Mutex<Sessions>,
}

impl TerminalManager {
    pub fn create(
        &self,
        owner: &str,
        spec: TerminalSpec,
        sink: impl Fn(TerminalEvent) -> bool + Send + Sync + 'static,
    ) -> Result<TerminalSession> {
        {
            let mut sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
            if sessions.shutting_down {
                bail!("Terminal manager is shutting down");
            }
            if sessions.items.len() + sessions.pending >= 8 {
                bail!("Close an existing terminal before opening another (limit: 8)");
            }
            sessions.pending += 1;
        }
        let created = Session::spawn(owner, spec, Arc::new(sink));
        let mut sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        sessions.pending -= 1;
        let session = created?;
        if sessions.shutting_down {
            drop(sessions);
            session.close();
            bail!("Terminal manager is shutting down");
        }
        let snapshot = session.snapshot();
        sessions.items.insert(snapshot.id.clone(), session);
        Ok(snapshot)
    }

    fn session(&self, owner: &str, id: &str) -> Result<Arc<Session>> {
        let sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        let session = sessions
            .items
            .get(id)
            .ok_or_else(|| anyhow::anyhow!("Terminal is closed"))?;
        if session.owner != owner {
            bail!("Terminal belongs to another window");
        }
        Ok(session.clone())
    }
    pub fn write(&self, owner: &str, id: &str, bytes: Vec<u8>) -> Result<()> {
        self.session(owner, id)?.write(bytes)
    }
    pub fn resize(&self, owner: &str, id: &str, size: TerminalSize) -> Result<()> {
        self.session(owner, id)?.resize(size.pty()?)
    }
    pub fn ack(&self, owner: &str, id: &str, seq: u64) -> Result<()> {
        self.session(owner, id)?.ack(seq)
    }
    pub fn launch_state(&self, owner: &str, id: &str) -> Result<LaunchState> {
        Ok(self.session(owner, id)?.launch_state())
    }
    pub fn launch_herdr(
        &self,
        owner: &str,
        id: &str,
        executable: &std::path::Path,
        revision: u64,
    ) -> Result<bool> {
        self.session(owner, id)?.launch_herdr(executable, revision)
    }
    pub fn list(&self, owner: &str) -> Result<Vec<TerminalSession>> {
        Ok(self
            .sessions
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .items
            .values()
            .filter(|s| s.owner == owner)
            .map(|s| s.snapshot())
            .collect())
    }
    pub fn close(&self, owner: &str, id: &str) -> Result<()> {
        let session = self.session(owner, id)?;
        self.sessions
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .items
            .remove(id);
        session.close();
        Ok(())
    }
    pub fn close_all(&self) {
        let items = {
            let mut sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
            sessions.shutting_down = true;
            std::mem::take(&mut sessions.items)
        };
        for session in items.into_values() {
            session.close();
        }
    }
}
impl Drop for TerminalManager {
    fn drop(&mut self) {
        self.close_all();
    }
}
