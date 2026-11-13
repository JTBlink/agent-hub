//! Explicit native worktree discovery, separate from sidebar snapshot polling.
use super::*;
use std::collections::HashSet;

impl HerdrControl {
    /// Ask the selected running session to rescan each open repository once.
    pub fn refresh_worktrees(&self, session: &str) -> Result<()> {
        let snapshot = self.snapshot(session)?;
        let mut repositories = HashSet::new();
        let mut errors = Vec::new();
        for workspace in &snapshot.workspaces {
            let Some(repository) = workspace
                .directory
                .as_deref()
                .and_then(|path| git2::Repository::discover(path).ok())
            else {
                continue;
            };
            let key = workspace
                .worktree
                .as_ref()
                .and_then(|tree| tree.get("repo_key"))
                .and_then(Value::as_str)
                .map(str::to_owned)
                .unwrap_or_else(|| repository.path().to_string_lossy().into_owned());
            if !repositories.insert(key) {
                continue;
            }
            if let Err(error) = self.call(
                Some(session),
                &["worktree", "list", "--workspace", &workspace.workspace_id],
                10,
            ) {
                errors.push(error.to_string());
            }
        }
        if !errors.is_empty() {
            bail!("Herdr worktree refresh failed: {}", errors.join("; "));
        }
        Ok(())
    }
}
