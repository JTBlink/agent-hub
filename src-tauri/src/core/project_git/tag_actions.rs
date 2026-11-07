//! Explicit operations on a single, fully qualified local tag.
use super::actions::{ensure_ready, repository, run_git, validate_branch_name};
use anyhow::{bail, Context, Result};
use serde::Deserialize;
use std::path::Path;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GitTagAction {
    Checkout,
    Push,
    Delete,
    CreateBranch,
}

pub fn tag_action(
    root: &Path,
    action: GitTagAction,
    tag: &str,
    expected_sha: Option<&str>,
    branch: Option<&str>,
    remote: Option<&str>,
) -> Result<()> {
    let repo = repository(root)?;
    ensure_ready(&repo)?;
    let reference = format!("refs/tags/{tag}");
    if tag.is_empty() || tag.starts_with('-') || !git2::Reference::is_valid_name(&reference) {
        bail!("Select a valid local tag");
    }
    let tag_ref = repo
        .find_reference(&reference)
        .context("Tag no longer exists; refresh the list")?;
    let commit = tag_ref.peel_to_commit().ok();
    if let Some(expected) = expected_sha {
        if commit.as_ref().map(|commit| commit.id()) != Some(git2::Oid::from_str(expected)?) {
            bail!("Tag changed; refresh the list before trying again");
        }
    }
    match action {
        GitTagAction::Checkout | GitTagAction::CreateBranch => {
            let sha = commit
                .context("Select a tag pointing to a commit")?
                .id()
                .to_string();
            if matches!(action, GitTagAction::CreateBranch) {
                let branch = branch.context("Enter a local branch name")?;
                validate_branch_name(branch)?;
                run_git(root, &["switch", "--no-guess", "-c", branch, &sha])
            } else {
                run_git(root, &["switch", "--detach", &sha])
            }
        }
        GitTagAction::Push => {
            let remote = remote.context("Select a configured remote")?;
            if remote.is_empty() || remote.starts_with('-') {
                bail!("Select a configured remote");
            }
            repo.find_remote(remote)
                .context("Select a configured remote")?;
            run_git(
                root,
                &["push", "--", remote, &format!("{reference}:{reference}")],
            )
        }
        GitTagAction::Delete => run_git(root, &["tag", "--delete", "--", tag]),
    }
}

#[cfg(test)]
mod tests;
