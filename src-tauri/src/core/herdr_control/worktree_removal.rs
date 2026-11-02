use super::*;

impl HerdrControl {
    /// Close the selected workspace only after validating its checkout for deletion.
    pub fn remove_worktree(
        &self,
        store: &super::super::skill_store::SkillStore,
        session: &str,
        workspace_id: &str,
        project_id: &str,
        path: &str,
    ) -> Result<()> {
        let _guard = MUTATION.lock().unwrap_or_else(|e| e.into_inner());
        let target = super::super::project_worktrees::validate_removal(store, project_id, path)?;
        let snapshot = self.snapshot(session)?;
        if let Some(workspace) = snapshot
            .workspaces
            .iter()
            .find(|w| w.workspace_id == workspace_id)
        {
            if directory_for(workspace, &snapshot.panes)? != target {
                bail!("Workspace checkout changed; refresh before deleting");
            }
            self.call(Some(session), &["workspace", "close", workspace_id], 10)?;
        }
        super::super::project_worktrees::remove(store, project_id, path)
    }
}
