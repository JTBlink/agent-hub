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
mod tests {
    use super::*;
    #[test]
    fn previews_include_context_far_from_changes() {
        let dir = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(dir.path()).unwrap();
        let original = (0..30).map(|i| format!("line {i}\n")).collect::<String>();
        std::fs::write(dir.path().join("demo.txt"), &original).unwrap();
        save(&repo, "initial");
        let changed = original.replace("line 15\n", "updated\n");
        std::fs::write(dir.path().join("demo.txt"), changed).unwrap();
        let patch = super::super::diff(dir.path(), "demo.txt", false).unwrap();
        assert!(patch.contains(" line 0\n"));
        assert!(patch.contains(" line 29\n"));
        let commit = save(&repo, "change");
        let patch = commit_diff(dir.path(), &commit, "demo.txt").unwrap();
        assert!(patch.contains(" line 0\n"));
        assert!(patch.contains(" line 29\n"));
    }

    fn save(repo: &git2::Repository, message: &str) -> String {
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("demo.txt")).unwrap();
        index.write().unwrap();
        let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
        let signature = git2::Signature::now("Example", "user@example.invalid").unwrap();
        let parent = repo.head().ok().map(|head| head.peel_to_commit().unwrap());
        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &parent.iter().collect::<Vec<_>>(),
        )
        .unwrap()
        .to_string()
    }
    #[test]
    fn reads_initial_and_parent_diffs_without_using_the_working_tree() {
        let temp = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(temp.path()).unwrap();
        std::fs::write(temp.path().join("demo.txt"), "first\n").unwrap();
        let first = save(&repo, "Initial\n\nFull description");
        let initial = commit_details(temp.path(), &first).unwrap();
        assert_eq!(initial.message, "Initial\n\nFull description");
        assert!(initial.parents.is_empty());
        assert_eq!(initial.additions, 1);
        assert_eq!(initial.files[0].status, "added");
        assert_eq!(initial.author_email, "user@example.invalid");
        assert_eq!(initial.committer_email, "user@example.invalid");
        assert_eq!(initial.files[0].additions, Some(1));
        assert_eq!(initial.files[0].deletions, Some(0));
        assert!(commit_diff(temp.path(), &first, "demo.txt")
            .unwrap()
            .contains("+first"));
        std::fs::write(temp.path().join("demo.txt"), "second\n").unwrap();
        let second = save(&repo, "Update");
        std::fs::write(temp.path().join("demo.txt"), "uncommitted\n").unwrap();
        let details = commit_details(temp.path(), &second).unwrap();
        assert_eq!(details.parents, vec![first]);
        assert_eq!((details.additions, details.deletions), (1, 1));
        assert_eq!(details.files[0].additions, Some(1));
        assert_eq!(details.files[0].deletions, Some(1));
        let patch = commit_diff(temp.path(), &second, "demo.txt").unwrap();
        assert!(patch.contains("-first") && patch.contains("+second"));
        assert!(!patch.contains("uncommitted"));
        assert!(commit_details(temp.path(), "HEAD").is_err());
        assert!(commit_diff(temp.path(), &second, "../outside").is_err());
    }
    #[test]
    fn binary_files_have_no_text_line_counts() {
        let temp = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(temp.path()).unwrap();
        std::fs::write(temp.path().join("demo.txt"), b"binary\0content").unwrap();
        let sha = save(&repo, "Binary file");
        let details = commit_details(temp.path(), &sha).unwrap();
        assert_eq!(details.files.len(), 1);
        assert_eq!(details.files[0].additions, None);
        assert_eq!(details.files[0].deletions, None);
    }

    #[test]
    fn preserves_rename_metadata_and_patch_paths() {
        let temp = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(temp.path()).unwrap();
        std::fs::write(temp.path().join("demo.txt"), "unchanged content\n").unwrap();
        let first = save(&repo, "Initial");
        std::fs::rename(
            temp.path().join("demo.txt"),
            temp.path().join("renamed.txt"),
        )
        .unwrap();
        let mut index = repo.index().unwrap();
        index.remove_path(Path::new("demo.txt")).unwrap();
        index.add_path(Path::new("renamed.txt")).unwrap();
        index.write().unwrap();
        let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
        let signature = git2::Signature::now("Example", "user@example.invalid").unwrap();
        let parent = repo
            .find_commit(git2::Oid::from_str(&first).unwrap())
            .unwrap();
        let sha = repo
            .commit(
                Some("HEAD"),
                &signature,
                &signature,
                "Rename",
                &tree,
                &[&parent],
            )
            .unwrap()
            .to_string();
        let details = commit_details(temp.path(), &sha).unwrap();
        assert_eq!(details.files.len(), 1);
        assert_eq!(details.files[0].status, "renamed");
        assert_eq!(details.files[0].old_path.as_deref(), Some("demo.txt"));
        let patch = commit_diff(temp.path(), &sha, "renamed.txt").unwrap();
        assert!(patch.contains("rename from demo.txt"));
        assert!(patch.contains("rename to renamed.txt"));
    }
    #[test]
    fn pages_tag_ancestry_without_reading_newer_head_commits() {
        let temp = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(temp.path()).unwrap();
        let mut ids = Vec::new();
        for index in 0..13 {
            std::fs::write(temp.path().join("demo.txt"), format!("content {index}\n")).unwrap();
            ids.push(save(&repo, &format!("Change {index}")));
        }
        let first = commit_history(temp.path(), &ids[11], 0).unwrap();
        assert_eq!(first.commits.len(), 10);
        assert_eq!(first.commits[0].sha, ids[11]);
        assert!(first.has_more);
        let second = commit_history(temp.path(), &ids[11], 10).unwrap();
        assert_eq!(second.commits.len(), 2);
        assert!(!second.has_more);
        assert_eq!(second.commits[1].sha, ids[0]);
        let all: Vec<_> = first
            .commits
            .iter()
            .chain(second.commits.iter())
            .map(|commit| &commit.sha)
            .collect();
        assert!(!all.contains(&&ids[12]));
        assert_eq!(
            all.iter().collect::<std::collections::HashSet<_>>().len(),
            12
        );
        assert!(commit_history(temp.path(), "HEAD", 0).is_err());
        assert!(commit_history(temp.path(), &ids[11], 100_001).is_err());
    }
    #[test]
    fn initial_and_paged_history_share_topological_order_with_skewed_merge_dates() {
        let temp = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(temp.path()).unwrap();
        let tree = repo
            .find_tree(repo.index().unwrap().write_tree().unwrap())
            .unwrap();
        let save = |message: &str, time: i64, parents: &[&git2::Commit<'_>]| {
            let signature =
                git2::Signature::new("Example", "user@example.invalid", &git2::Time::new(time, 0))
                    .unwrap();
            repo.commit(None, &signature, &signature, message, &tree, parents)
                .unwrap()
        };
        let root = repo.find_commit(save("Root", 500, &[])).unwrap();
        let left = repo.find_commit(save("Left", 100, &[&root])).unwrap();
        let right = repo.find_commit(save("Right", 200, &[&root])).unwrap();
        let merge = save("Merge", 300, &[&left, &right]);
        repo.reference("refs/heads/main", merge, true, "fixture")
            .unwrap();
        repo.set_head("refs/heads/main").unwrap();
        let initial = super::super::status(temp.path()).unwrap();
        let page = commit_history(temp.path(), &merge.to_string(), 0).unwrap();
        assert_eq!(
            initial
                .commits
                .iter()
                .map(|commit| &commit.sha)
                .collect::<Vec<_>>(),
            page.commits
                .iter()
                .map(|commit| &commit.sha)
                .collect::<Vec<_>>()
        );
        assert_eq!(page.commits.last().unwrap().sha, root.id().to_string());
    }
}
