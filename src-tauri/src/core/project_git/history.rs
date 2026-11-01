//! Read-only commit inspection against the first parent (or the empty initial tree).
use anyhow::{bail, Result};
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
pub struct CommitFile {
    pub path: String,
    pub old_path: Option<String>,
    pub status: String,
    pub additions: Option<usize>,
    pub deletions: Option<usize>,
}

#[derive(Serialize)]
pub struct GitCommitDetails {
    pub sha: String,
    pub message: String,
    pub author: String,
    pub committer: String,
    pub author_email: String,
    pub committer_email: String,
    pub time: i64,
    pub parents: Vec<String>,
    pub files: Vec<CommitFile>,
    pub additions: usize,
    pub deletions: usize,
    pub truncated: bool,
}

fn oid(sha: &str) -> Result<git2::Oid> {
    if sha.len() != 40 || !sha.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        bail!("Invalid full commit ID");
    }
    Ok(git2::Oid::from_str(sha)?)
}

fn trees<'a>(
    repo: &'a git2::Repository,
    sha: &str,
) -> Result<(Option<git2::Tree<'a>>, git2::Tree<'a>)> {
    let commit = repo.find_commit(oid(sha)?)?;
    let parent = if commit.parent_count() > 0 {
        Some(commit.parent(0)?.tree()?)
    } else {
        None
    };
    Ok((parent, commit.tree()?))
}

pub fn commit_details(root: &Path, sha: &str) -> Result<GitCommitDetails> {
    let repo =
        git2::Repository::open_ext(root, git2::RepositoryOpenFlags::NO_SEARCH, &[] as &[&Path])?;
    let commit = repo.find_commit(oid(sha)?)?;
    let (parent, tree) = trees(&repo, sha)?;
    let mut diff = repo.diff_tree_to_tree(parent.as_ref(), Some(&tree), None)?;
    diff.find_similar(None)?;
    let stats = diff.stats()?;
    let files = diff
        .deltas()
        .take(1000)
        .enumerate()
        .map(|(index, delta)| -> Result<CommitFile> {
            let patch = git2::Patch::from_diff(&diff, index)?;
            let lines = patch
                .as_ref()
                .filter(|patch| {
                    let delta = patch.delta();
                    !delta.old_file().is_binary() && !delta.new_file().is_binary()
                })
                .map(|patch| patch.line_stats())
                .transpose()?;
            let path = delta
                .new_file()
                .path()
                .or(delta.old_file().path())
                .map(|path| path.to_string_lossy().into_owned())
                .unwrap_or_default();
            let old_path = delta
                .old_file()
                .path()
                .map(|path| path.to_string_lossy().into_owned())
                .filter(|old| old != &path);
            Ok(CommitFile {
                path,
                old_path,
                additions: lines.map(|(_, added, _)| added),
                deletions: lines.map(|(_, _, deleted)| deleted),
                status: match delta.status() {
                    git2::Delta::Added => "added",
                    git2::Delta::Deleted => "deleted",
                    git2::Delta::Renamed => "renamed",
                    _ => "modified",
                }
                .into(),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let author = commit.author().name().unwrap_or_default().to_owned();
    let committer = commit.committer().name().unwrap_or_default().to_owned();
    let author_email = commit.author().email().unwrap_or_default().to_owned();
    let committer_email = commit.committer().email().unwrap_or_default().to_owned();
    Ok(GitCommitDetails {
        sha: commit.id().to_string(),
        message: commit.message().unwrap_or_default().into(),
        author,
        committer,
        author_email,
        committer_email,
        time: commit.time().seconds(),
        parents: commit.parent_ids().map(|id| id.to_string()).collect(),
        files,
        additions: stats.insertions(),
        deletions: stats.deletions(),
        truncated: diff.deltas().len() > 1000,
    })
}

pub fn commit_diff(root: &Path, sha: &str, path: &str) -> Result<String> {
    super::validate_file_path(path)?;
    let repo =
        git2::Repository::open_ext(root, git2::RepositoryOpenFlags::NO_SEARCH, &[] as &[&Path])?;
    let (parent, tree) = trees(&repo, sha)?;
    let mut options = git2::DiffOptions::new();
    options.context_lines(u32::MAX);
    let mut diff = repo.diff_tree_to_tree(parent.as_ref(), Some(&tree), Some(&mut options))?;
    diff.find_similar(None)?;
    super::render_diff_for_path(&diff, Some(path))
}

#[derive(Serialize)]
pub struct GitHistoryPage {
    pub commits: Vec<super::GitCommit>,
    pub has_more: bool,
}

/// Browse the immutable history reachable from a selected commit, ten rows at a time.
pub fn commit_history(root: &Path, sha: &str, offset: usize) -> Result<GitHistoryPage> {
    if offset > 100_000 {
        bail!("History offset exceeds the preview limit");
    }
    let repo =
        git2::Repository::open_ext(root, git2::RepositoryOpenFlags::NO_SEARCH, &[] as &[&Path])?;
    let commit = repo.find_commit(oid(sha)?)?;
    let walk = super::history_walk(&repo, commit.id())?;
    let mut commits = Vec::new();
    for id in walk.skip(offset).take(11) {
        commits.push(super::summarize_commit(&repo.find_commit(id?)?));
    }
    let has_more = commits.len() > 10;
    commits.truncate(10);
    Ok(GitHistoryPage { commits, has_more })
}

#[cfg(test)]
mod tests;
