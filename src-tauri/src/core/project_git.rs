//! Git inspection and explicit local changes within an authorized registered checkout.
mod actions;
mod graph;
mod history;
pub use graph::{graph, GitGraph};
mod references;
mod remotes;
mod repository_actions;
mod status_files;
mod tag_actions;
pub use actions::{commit, discard, set_staged};
pub(crate) use actions::{run_git, validate_branch_name};
use anyhow::{bail, Result};
pub use history::{
    commit_details, commit_file_view, commit_history, GitCommitDetails, GitHistoryPage,
};
pub use references::{references, GitReferences};
pub use remotes::{remotes, GitRemote};
pub use repository_actions::{repository_action, GitRepositoryAction};
use serde::Serialize;
use std::path::Path;
pub use tag_actions::{tag_action, GitTagAction};

#[derive(Serialize)]
pub struct GitFile {
    pub path: String,
    pub staged: bool,
    pub unstaged: bool,
    pub conflicted: bool,
    pub status: String,
}
#[derive(Serialize)]
pub struct GitCommit {
    pub sha: String,
    pub summary: String,
    pub author: String,
    pub time: i64,
}
#[derive(Serialize)]
pub struct GitStatus {
    pub branch: Option<String>,
    pub head: Option<String>,
    pub upstream: Option<String>,
    pub ahead: Option<usize>,
    pub behind: Option<usize>,
    pub state: String,
    pub files: Vec<GitFile>,
    pub commits: Vec<GitCommit>,
    pub truncated: bool,
}

fn summarize_commit(commit: &git2::Commit<'_>) -> GitCommit {
    GitCommit {
        sha: commit.id().to_string(),
        summary: commit.summary().unwrap_or_default().into(),
        author: commit.author().name().unwrap_or_default().into(),
        time: commit.time().seconds(),
    }
}

fn history_walk(repo: &git2::Repository, head: git2::Oid) -> Result<git2::Revwalk<'_>> {
    let mut walk = repo.revwalk()?;
    walk.set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME)?;
    walk.push(head)?;
    Ok(walk)
}

pub fn status(root: &Path) -> Result<GitStatus> {
    let repo =
        git2::Repository::open_ext(root, git2::RepositoryOpenFlags::NO_SEARCH, &[] as &[&Path])?;
    repository_status(root, &repo)
}

/// Ordinary folders have no source-control status; damaged repositories remain errors.
pub fn inspect(root: &Path) -> Result<Option<GitStatus>> {
    match git2::Repository::open_ext(root, git2::RepositoryOpenFlags::NO_SEARCH, &[] as &[&Path]) {
        Ok(repo) => repository_status(root, &repo).map(Some),
        Err(error)
            if error.code() == git2::ErrorCode::NotFound
                && root.is_dir()
                && root
                    .join(".git")
                    .symlink_metadata()
                    .is_err_and(|cause| cause.kind() == std::io::ErrorKind::NotFound) =>
        {
            Ok(None)
        }
        Err(error) => Err(error.into()),
    }
}

fn repository_status(root: &Path, repo: &git2::Repository) -> Result<GitStatus> {
    let head = repo.head().ok();
    let oid = head.as_ref().and_then(|head| head.target());
    let branch = head
        .as_ref()
        .filter(|head| head.is_branch())
        .and_then(|head| head.shorthand())
        .map(str::to_owned);
    let upstream = branch
        .as_ref()
        .and_then(|name| repo.find_branch(name, git2::BranchType::Local).ok())
        .and_then(|branch| branch.upstream().ok());
    let divergence = oid
        .zip(upstream.as_ref().and_then(|branch| branch.get().target()))
        .and_then(|(head, remote)| repo.graph_ahead_behind(head, remote).ok());
    let (files, truncated) = status_files::status_files(root)?;
    let mut commits = Vec::new();
    if let Some(oid) = oid {
        let walk = history_walk(repo, oid)?;
        for oid in walk.take(30) {
            let commit = repo.find_commit(oid?)?;
            commits.push(summarize_commit(&commit));
        }
    }
    Ok(GitStatus {
        branch,
        head: oid.map(|oid| oid.to_string()),
        upstream: upstream.and_then(|branch| branch.name().ok().flatten().map(str::to_owned)),
        ahead: divergence.map(|value| value.0),
        behind: divergence.map(|value| value.1),
        state: format!("{:?}", repo.state()),
        files,
        commits,
        truncated,
    })
}

pub fn diff(root: &Path, path: &str, staged: bool) -> Result<String> {
    validate_file_path(path)?;
    let repo =
        git2::Repository::open_ext(root, git2::RepositoryOpenFlags::NO_SEARCH, &[] as &[&Path])?;
    let mut options = git2::DiffOptions::new();
    options
        .context_lines(DIFF_CONTEXT_LINES)
        .pathspec(path)
        .disable_pathspec_match(true)
        .include_untracked(true)
        .show_untracked_content(true)
        .recurse_untracked_dirs(true);
    let tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());
    let diff = if staged {
        repo.diff_tree_to_index(tree.as_ref(), None, Some(&mut options))?
    } else {
        repo.diff_index_to_workdir(None, Some(&mut options))?
    };
    render_diff(&diff)
}

const MAX_DIFF_BYTES: usize = 1024 * 1024;
// xdiff doubles this C long. The rendering budget already bounds valid output
// below this many lines; keep the intermediate arithmetic safe on Windows.
const DIFF_CONTEXT_LINES: u32 = MAX_DIFF_BYTES as u32;

fn render_diff(diff: &git2::Diff<'_>) -> Result<String> {
    render_diff_for_path(diff, None)
}

fn render_diff_for_path(diff: &git2::Diff<'_>, path: Option<&str>) -> Result<String> {
    let mut bytes = Vec::new();
    let mut oversized = false;
    diff.print(git2::DiffFormat::Patch, |delta, _, line| {
        if let Some(path) = path {
            if delta.new_file().path() != Some(Path::new(path))
                && delta.old_file().path() != Some(Path::new(path))
            {
                return true;
            }
        }
        if bytes.len() + line.content().len() > MAX_DIFF_BYTES {
            oversized = true;
            return false;
        }
        if matches!(line.origin(), '+' | '-' | ' ') {
            bytes.push(line.origin() as u8);
        }
        bytes.extend_from_slice(line.content());
        true
    })
    .or_else(|error| if oversized { Ok(()) } else { Err(error) })?;
    if oversized {
        bail!("Diff exceeds the 1 MiB preview limit");
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn validate_file_path(path: &str) -> Result<()> {
    if Path::new(path)
        .components()
        .any(|part| !matches!(part, std::path::Component::Normal(_)))
        || path.is_empty()
    {
        bail!("Invalid repository file path");
    }
    Ok(())
}

#[cfg(test)]
mod tests;
