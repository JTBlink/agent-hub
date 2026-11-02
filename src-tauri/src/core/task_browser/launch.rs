use crate::core::{
    herdr::control::{HerdrControl, OpenedWorkspace},
    herdr::session::{Client, SESSION},
    project_worktrees,
    skill_store::SkillStore,
};
use anyhow::Result;
use std::path::Path;

/// Task starts may create only the application-owned session; existing sessions are never restarted.
pub fn prepare_managed_workspace(
    store: &SkillStore,
    executable: &Path,
    project_id: &str,
    path: &str,
) -> Result<OpenedWorkspace> {
    let directory = project_worktrees::directory(store, project_id, Some(path))?;
    Client {
        executable,
        cwd: &directory,
    }
    .ensure_server()?;
    HerdrControl::new(executable.into()).ensure(store, SESSION, project_id, Some(path))
}
