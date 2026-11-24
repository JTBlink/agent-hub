//! Topologically ordered history across local and optionally cached remote branches.
use anyhow::Result;
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Seek, Write},
    path::Path,
};

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
    graph_for_path(root, include_remotes, limit, branch, None)
}

/// Use the same references and commit metadata for the graph of a literal repository path.
pub fn graph_for_path(
    root: &Path,
    include_remotes: bool,
    limit: usize,
    branch: Option<&str>,
    path: Option<&str>,
) -> Result<GitGraph> {
    if let Some(path) = path {
        super::validate_file_path(path)?;
    }
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
    let mut selected_tip = None;
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
        let tip = git2::Oid::from_str(&selected.sha)?;
        selected_tip = Some(tip);
        walk.reset()?;
        walk.push(tip)?;
    }
    let limit = limit.clamp(100, 5000);
    let rows = path
        .map(|path| {
            let mut tips = match selected_tip {
                Some(tip) => vec![tip],
                None => refs.keys().copied().chain(head_id).collect::<Vec<_>>(),
            };
            tips.sort_unstable();
            tips.dedup();
            path_rows(root, path, limit + 1, &tips)
        })
        .transpose()?;
    let rows: Box<dyn Iterator<Item = Result<_>>> = match rows {
        Some(rows) => Box::new(
            rows.into_iter()
                .map(|(id, parents)| Ok((id, Some(parents)))),
        ),
        None => Box::new(walk.take(limit + 1).map(|id| Ok((id?, None)))),
    };
    let mut commits = Vec::new();
    let mut add_commit = |id, parents: Option<Vec<String>>| -> Result<()> {
        let commit = repo.find_commit(id)?;
        let mut labels = refs.remove(&id).unwrap_or_default();
        labels.sort_by(|a, b| a.name.cmp(&b.name));
        commits.push(GraphCommit {
            commit: super::summarize_commit(&commit),
            parents: parents
                .unwrap_or_else(|| commit.parent_ids().map(|id| id.to_string()).collect()),
            refs: labels,
            head: head_id == Some(id),
        });
        Ok(())
    };
    for row in rows {
        let (id, parents) = row?;
        add_commit(id, parents)?;
    }
    let has_more = commits.len() > limit;
    commits.truncate(limit);
    Ok(GitGraph {
        commits,
        has_more,
        branches,
    })
}

// Parent rewriting connects the visible changes across commits that did not touch this path.
fn path_rows(
    root: &Path,
    path: &str,
    limit: usize,
    tips: &[git2::Oid],
) -> Result<Vec<(git2::Oid, Vec<String>)>> {
    if tips.is_empty() {
        return Ok(Vec::new());
    }
    let mut input = tempfile::tempfile()?;
    for tip in tips {
        writeln!(input, "{tip}")?;
    }
    input.rewind()?;
    let mut command = super::actions::git_command(root);
    command
        .env("GIT_NO_LAZY_FETCH", "1")
        .env("GIT_NO_REPLACE_OBJECTS", "1")
        .args([
            "rev-list",
            "--stdin",
            "--topo-order",
            "--parents",
            "--full-history",
            "--simplify-merges",
        ])
        .arg(format!("--max-count={limit}"))
        .args(["--", path]);
    let (output, _) = super::super::cli_process::capture_prepared_with_input(
        command,
        "git",
        30,
        None,
        Some(input),
    )
    .map_err(anyhow::Error::msg)?;
    output
        .lines()
        .map(|line| {
            let mut fields = line.split_whitespace();
            let id = git2::Oid::from_str(fields.next().unwrap_or_default())?;
            Ok((id, fields.map(str::to_owned).collect()))
        })
        .collect()
}

#[cfg(test)]
mod tests;
