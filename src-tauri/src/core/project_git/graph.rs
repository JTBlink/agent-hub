//! Topologically ordered history across local and optionally cached remote branches.
use anyhow::Result;
use serde::Serialize;
use std::{collections::HashMap, path::Path};

#[derive(Serialize)]
pub struct GraphReference {
    pub name: String,
    pub remote: bool,
    pub kind: &'static str,
    pub remote_name: Option<String>,
    pub current: bool,
}
#[derive(Serialize)]
pub struct GraphCommit {
    #[serde(flatten)]
    pub commit: super::GitCommit,
    pub parents: Vec<String>,
    pub refs: Vec<GraphReference>,
    pub head: bool,
}
#[derive(Serialize)]
pub struct GitGraph {
    pub commits: Vec<GraphCommit>,
    pub has_more: bool,
}

pub fn graph(root: &Path, include_remotes: bool, limit: usize) -> Result<GitGraph> {
    let repo =
        git2::Repository::open_ext(root, git2::RepositoryOpenFlags::NO_SEARCH, &[] as &[&Path])?;
    let mut walk = repo.revwalk()?;
    walk.set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME)?;
    let mut refs: HashMap<git2::Oid, Vec<GraphReference>> = HashMap::new();
    let head = repo.head().ok();
    let head_id = head.as_ref().and_then(|head| head.target());
    let remote_names = repo.remotes()?;
    for reference in repo.references()? {
        let reference = reference?;
        if !(reference.is_branch()
            || reference.is_tag()
            || (include_remotes && reference.is_remote()))
        {
            continue;
        }
        let Ok(commit) = reference.peel_to_commit() else {
            continue;
        };
        walk.push(commit.id())?;
        let name = reference.shorthand().unwrap_or_default();
        let remote_name = if reference.is_remote() {
            remote_names
                .iter()
                .flatten()
                .filter(|remote| {
                    name.strip_prefix(remote)
                        .is_some_and(|suffix| suffix.starts_with('/'))
                })
                .max_by_key(|remote| remote.len())
                .map(str::to_owned)
        } else {
            None
        };
        refs.entry(commit.id()).or_default().push(GraphReference {
            name: name.into(),
            remote: reference.is_remote(),
            kind: if reference.is_tag() {
                "tag"
            } else if reference.is_remote() {
                "remote"
            } else {
                "branch"
            },
            remote_name,
            current: reference.is_branch()
                && head.as_ref().and_then(|head| head.name()) == reference.name(),
        });
    }
    // Detached HEAD must remain visible even when no reference points to it.
    if let Ok(head) = repo.head().and_then(|head| head.peel_to_commit()) {
        walk.push(head.id())?;
    }
    let limit = limit.clamp(100, 5000);
    let mut commits = Vec::new();
    for id in walk.take(limit + 1) {
        let id = id?;
        if commits.len() == limit {
            return Ok(GitGraph {
                commits,
                has_more: true,
            });
        }
        let commit = repo.find_commit(id)?;
        let mut labels = refs.remove(&id).unwrap_or_default();
        labels.sort_by(|a, b| a.name.cmp(&b.name));
        commits.push(GraphCommit {
            commit: super::summarize_commit(&commit),
            parents: commit.parent_ids().map(|id| id.to_string()).collect(),
            refs: labels,
            head: head_id == Some(id),
        });
    }
    Ok(GitGraph {
        commits,
        has_more: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn commit(repo: &git2::Repository, message: &str, parents: &[&git2::Commit<'_>]) -> git2::Oid {
        let tree = repo
            .find_tree(repo.index().unwrap().write_tree().unwrap())
            .unwrap();
        let sig = git2::Signature::now("Example", "user@example.invalid").unwrap();
        repo.commit(None, &sig, &sig, message, &tree, parents)
            .unwrap()
    }
    #[test]
    fn includes_merge_edges_tags_and_optional_remote_history() {
        let dir = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(dir.path()).unwrap();
        let base = repo.find_commit(commit(&repo, "base", &[])).unwrap();
        let left = repo.find_commit(commit(&repo, "left", &[&base])).unwrap();
        let right = repo.find_commit(commit(&repo, "right", &[&base])).unwrap();
        let merge = repo
            .find_commit(commit(&repo, "merge", &[&left, &right]))
            .unwrap();
        repo.branch("main", &merge, true).unwrap();
        repo.set_head("refs/heads/main").unwrap();
        repo.remote("origin", "https://example.invalid/demo.git")
            .unwrap();
        repo.reference("refs/remotes/origin/main", merge.id(), true, "test")
            .unwrap();
        repo.reference_symbolic(
            "refs/remotes/origin/HEAD",
            "refs/remotes/origin/main",
            true,
            "test",
        )
        .unwrap();
        repo.tag_lightweight("v1.0.0", merge.as_object(), false)
            .unwrap();
        let remote = commit(&repo, "remote", &[&merge]);
        repo.reference("refs/remotes/origin/topic", remote, true, "test")
            .unwrap();
        let local = graph(dir.path(), false, 100).unwrap();
        assert_eq!(local.commits[0].parents.len(), 2);
        assert!(local.commits[0].refs.iter().any(|r| r.name == "v1.0.0"));
        assert!(!local
            .commits
            .iter()
            .any(|c| c.commit.sha == remote.to_string()));
        let all = graph(dir.path(), true, 100).unwrap();
        assert_eq!(all.commits[0].commit.sha, remote.to_string());
        assert!(all.commits[0].refs[0].remote);
        let head = all.commits.iter().find(|commit| commit.head).unwrap();
        assert_eq!(head.commit.sha, merge.id().to_string());
        assert!(head.refs.iter().any(|reference| reference.name == "main"
            && reference.current
            && reference.kind == "branch"));
        assert!(head
            .refs
            .iter()
            .any(|reference| reference.name == "origin/main"
                && reference.remote_name.as_deref() == Some("origin")));
        assert!(head.refs.iter().any(|reference| reference.name == "v1.0.0"
            && reference.kind == "tag"
            && !reference.current));
    }
    #[test]
    fn empty_repository_has_no_commits() {
        let dir = tempfile::tempdir().unwrap();
        git2::Repository::init(dir.path()).unwrap();
        assert!(graph(dir.path(), true, 100).unwrap().commits.is_empty());
    }
}
