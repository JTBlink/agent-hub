//! Explicit index changes and commits. Git CLI preserves hooks and signing configuration.
use anyhow::{bail, Context, Result};
use std::path::Path;
use std::process::Command;

pub(super) fn repository(root: &Path) -> Result<git2::Repository> {
    Ok(git2::Repository::open_ext(
        root,
        git2::RepositoryOpenFlags::NO_SEARCH,
        &[] as &[&Path],
    )?)
}

pub(crate) fn validate_branch_name(branch: &str) -> Result<()> {
    if branch.is_empty()
        || branch.starts_with('-')
        || !git2::Reference::is_valid_name(&format!("refs/heads/{branch}"))
    {
        bail!("Enter a valid local branch name");
    }
    Ok(())
}

pub(super) fn git_command(root: &Path) -> Command {
    let mut command = Command::new("git");
    command
        .arg("--literal-pathspecs")
        .arg("-C")
        .arg(root)
        .env("GIT_TERMINAL_PROMPT", "0");
    // The authorized checkout, rather than a launching shell's overrides, owns the operation.
    for name in [
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_INDEX_FILE",
        "GIT_COMMON_DIR",
    ] {
        command.env_remove(name);
    }
    command
}

pub(crate) fn run_git(root: &Path, args: &[&str]) -> Result<()> {
    let mut command = git_command(root);
    command.args(args);
    super::super::cli_process::capture_prepared(command, "git", 120, None)
        .map_err(anyhow::Error::msg)
        .context("Unable to complete Git operation")?;
    Ok(())
}

/// Update only the explicitly selected paths; unstaging never changes working files.
pub fn set_staged(root: &Path, paths: &[String], staged: bool) -> Result<()> {
    if paths.is_empty() || paths.len() > 2000 {
        bail!("Select between 1 and 2000 files");
    }
    for path in paths {
        super::validate_file_path(path)?;
    }
    let repo = repository(root)?;
    let mut selected = paths.to_vec();
    // A staged rename has both a removal and an addition. Reset both sides together.
    if !staged {
        let mut options = git2::StatusOptions::new();
        options.renames_head_to_index(true);
        for entry in repo.statuses(Some(&mut options))?.iter() {
            if let Some(delta) = entry.head_to_index() {
                let old = delta.old_file().path().and_then(Path::to_str);
                let new = delta.new_file().path().and_then(Path::to_str);
                if old
                    .into_iter()
                    .chain(new)
                    .any(|path| paths.iter().any(|item| item == path))
                {
                    for path in old.into_iter().chain(new) {
                        super::validate_file_path(path)?;
                        if !selected.iter().any(|item| item == path) {
                            selected.push(path.to_string());
                        }
                    }
                }
            }
        }
    }
    let mut args = if staged {
        vec!["add", "-A", "--"]
    } else if repo.head().is_ok() {
        vec!["reset", "-q", "HEAD", "--"]
    } else {
        vec!["rm", "--cached", "-r", "--ignore-unmatch", "--"]
    };
    args.extend(selected.iter().map(String::as_str));
    run_git(root, &args)
}

/// Restore selected working files from the index, leaving staged content untouched.
/// Untracked files are removed only when explicitly selected; directories are never swept.
pub fn discard(root: &Path, paths: &[String]) -> Result<()> {
    if paths.is_empty() || paths.len() > 2000 {
        bail!("Select between 1 and 2000 files");
    }
    let repo = repository(root)?;
    let index = repo.index()?;
    if index.has_conflicts() {
        bail!("Resolve index conflicts before discarding changes");
    }
    let mut tracked = Vec::new();
    let mut untracked = Vec::new();
    for path in paths {
        super::validate_file_path(path)?;
        if index.get_path(Path::new(path), 0).is_some() {
            tracked.push(path.as_str());
        } else {
            let status = repo.status_file(Path::new(path))?;
            if !status.is_wt_new() {
                bail!("Selected path is not an untracked file: {path}");
            }
            let metadata = std::fs::symlink_metadata(root.join(path))?;
            if metadata.is_dir() {
                bail!("Select individual files rather than directories: {path}");
            }
            untracked.push(path.as_str());
        }
    }
    if !tracked.is_empty() {
        let mut args = vec!["restore", "--worktree", "--"];
        args.extend(tracked);
        run_git(root, &args)?;
    }
    if !untracked.is_empty() {
        let mut args = vec!["clean", "-f", "--"];
        args.extend(untracked);
        run_git(root, &args)?;
    }
    Ok(())
}

/// Commit the index only, using the repository's configured identity, hooks and signing.
pub fn commit(root: &Path, message: &str) -> Result<()> {
    if message.trim().is_empty() || message.len() > 64 * 1024 || message.contains('\0') {
        bail!("Enter a commit message of at most 64 KiB");
    }
    let repo = repository(root)?;
    if repo.state() != git2::RepositoryState::Clean || repo.index()?.has_conflicts() {
        bail!("Resolve the current repository operation and conflicts before committing");
    }
    run_git(root, &["commit", "-m", message])
}

#[cfg(test)]
mod tests;
