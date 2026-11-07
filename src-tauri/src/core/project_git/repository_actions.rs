//! Explicit repository operations; no force push, reset, or implicit merge.
use super::actions::{ensure_ready, repository, run_git, validate_branch_name};
use anyhow::{bail, Context, Result};
use serde::Deserialize;
use std::path::Path;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GitRepositoryAction {
    Fetch,
    Pull,
    Push,
    SwitchBranch,
    CreateBranch,
}

pub fn repository_action(
    root: &Path,
    action: GitRepositoryAction,
    branch: Option<&str>,
) -> Result<()> {
    let repo = repository(root)?;
    if matches!(action, GitRepositoryAction::Fetch) {
        if repo.remotes()?.is_empty() {
            bail!("Configure a Git remote before fetching");
        }
        return run_git(root, &["fetch", "--all"]);
    }
    ensure_ready(&repo)?;
    match action {
        GitRepositoryAction::SwitchBranch | GitRepositoryAction::CreateBranch => {
            let branch = branch.context("Select or enter a local branch name")?;
            validate_branch_name(branch)?;
            if matches!(action, GitRepositoryAction::CreateBranch) {
                run_git(root, &["switch", "--no-guess", "-c", branch])
            } else {
                repo.find_branch(branch, git2::BranchType::Local)
                    .context("Select an existing local branch")?;
                run_git(root, &["switch", "--no-guess", branch])
            }
        }
        GitRepositoryAction::Pull | GitRepositoryAction::Push => {
            let head = repo
                .head()
                .context("Create a commit before synchronizing")?;
            if !head.is_branch() {
                bail!("Switch to a local branch before synchronizing");
            }
            let reference = head.name().context("Branch name is not valid UTF-8")?;
            let remote = repo
                .branch_upstream_remote(reference)
                .context("Configure an upstream branch before synchronizing")?;
            let remote = remote.as_str().context("Remote name is not valid UTF-8")?;
            let branch_name = head.shorthand().context("Branch name is not valid UTF-8")?;
            let merge = repo
                .config()?
                .get_string(&format!("branch.{branch_name}.merge"))?;
            let merge = merge.as_str();
            if remote.starts_with('-') || !merge.starts_with("refs/heads/") {
                bail!("Configure a valid upstream branch before synchronizing");
            }
            if matches!(action, GitRepositoryAction::Pull) {
                run_git(
                    root,
                    &["pull", "--ff-only", "--no-rebase", "--", remote, merge],
                )
            } else {
                run_git(root, &["push", "--", remote, &format!("HEAD:{merge}")])
            }
        }
        GitRepositoryAction::Fetch => unreachable!(),
    }
}

#[cfg(test)]
mod tests;
