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
pub struct GraphBranch {
    pub name: String,
    pub remote: bool,
    pub sha: String,
}

#[derive(Serialize)]
pub struct GitGraph {
    pub commits: Vec<GraphCommit>,
    pub has_more: bool,
    pub branches: Vec<GraphBranch>,
}

#[cfg(test)]
fn graph(root: &Path, include_remotes: bool, limit: usize) -> Result<GitGraph> {
    graph_for_branch(root, include_remotes, limit, None)
}

pub fn graph_for_branch(
    root: &Path,
    include_remotes: bool,
    limit: usize,
    branch: Option<&str>,
) -> Result<GitGraph> {
    let repo =
        git2::Repository::open_ext(root, git2::RepositoryOpenFlags::NO_SEARCH, &[] as &[&Path])?;
    let mut walk = repo.revwalk()?;
    walk.set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME)?;
    let mut refs: HashMap<git2::Oid, Vec<GraphReference>> = HashMap::new();
    let mut branches = Vec::new();
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
        if !reference.is_tag() && reference.symbolic_target().is_none() {
            branches.push(GraphBranch {
                name: name.into(),
                remote: reference.is_remote(),
                sha: commit.id().to_string(),
            });
        }
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
    if let Some(branch) = branch {
        // Accept only a branch tip from this repository's visible references.
        let selected = branches
            .iter()
            .find(|candidate| {
                let prefix = if candidate.remote {
                    "refs/remotes/"
                } else {
                    "refs/heads/"
                };
                branch.strip_prefix(prefix) == Some(candidate.name.as_str())
            })
            .ok_or_else(|| anyhow::anyhow!("Selected branch is no longer available"))?;
        walk.reset()?;
        walk.push(git2::Oid::from_str(&selected.sha)?)?;
    }
    let limit = limit.clamp(100, 5000);
    let mut commits = Vec::new();
    for id in walk.take(limit + 1) {
        let id = id?;
        if commits.len() == limit {
            return Ok(GitGraph {
                commits,
                has_more: true,
                branches,
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
        branches,
    })
}

#[cfg(test)]
mod tests;
