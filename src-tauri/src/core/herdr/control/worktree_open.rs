//! Open an existing checkout through its owning Herdr workspace.
use super::*;

impl HerdrControl {
    /// Open or reuse a linked checkout beneath the verified project workspace.
    pub fn open_worktree(
        &self,
        store: &crate::core::skill_store::SkillStore,
        session: &str,
        project_id: &str,
        parent_workspace_id: &str,
        path: &str,
    ) -> Result<OpenedWorkspace> {
        let _guard = MUTATION.lock().unwrap_or_else(|e| e.into_inner());
        let directory = crate::core::project_worktrees::directory(store, project_id, Some(path))?;
        let root = crate::core::project_worktrees::directory(store, project_id, None)?;
        let snapshot = self.snapshot(session)?;
        let parent = snapshot
            .workspaces
            .iter()
            .find(|workspace| workspace.workspace_id == parent_workspace_id)
            .context("Parent Herdr workspace no longer exists; refresh the sidebar")?;
        if directory_for(parent, &snapshot.panes)? != root {
            bail!("Parent Herdr workspace does not belong to this project")
        }
        if directory == root {
            return self.open_locked(store, session, parent_workspace_id, None);
        }
        let opened = self.call(
            Some(session),
            &[
                "worktree",
                "open",
                "--workspace",
                parent_workspace_id,
                "--path",
                directory
                    .to_str()
                    .context("Worktree path must be Unicode")?,
                "--no-focus",
            ],
            10,
        )?;
        let id = opened
            .pointer("/workspace/workspace_id")
            .and_then(Value::as_str)
            .context(
                "Herdr did not return the opened worktree workspace; refresh before retrying",
            )?;
        let result = self.open_locked(store, session, id, None)?;
        if Path::new(&result.path) != directory {
            bail!("Herdr opened a different checkout; refresh before retrying")
        }
        Ok(result)
    }
}
