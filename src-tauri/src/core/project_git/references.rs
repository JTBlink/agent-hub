//! Bounded, local-only repository navigation. Remote URLs and credentials stay private.
use anyhow::Result;
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
pub struct GitReferenceEntry {
    pub kind: String,
    pub name: String,
    pub sha: Option<String>,
    pub summary: Option<String>,
    pub time: Option<i64>,
}
#[derive(Serialize)]
pub struct GitReferences {
    pub entries: Vec<GitReferenceEntry>,
    pub truncated: bool,
}

pub fn references(root: &Path) -> Result<GitReferences> {
    let mut repo =
        git2::Repository::open_ext(root, git2::RepositoryOpenFlags::NO_SEARCH, &[] as &[&Path])?;
    let mut entries = Vec::new();
    let mut truncated = false;
    for (kind, pattern) in [
        ("branches", "refs/heads/*"),
        ("remotes", "refs/remotes/*"),
        ("tags", "refs/tags/*"),
    ] {
        for (index, reference) in repo.references_glob(pattern)?.enumerate() {
            if index >= 1000 {
                truncated = true;
                break;
            }
            let reference = reference?;
            let commit = reference.peel_to_commit().ok();
            let tag = reference.peel_to_tag().ok();
            let summary = if kind == "tags" {
                tag.as_ref()
                    .and_then(|tag| tag.message())
                    .and_then(|message| message.lines().find(|line| !line.trim().is_empty()))
                    .or_else(|| commit.as_ref().and_then(|commit| commit.summary()))
                    .map(str::to_owned)
            } else {
                None
            };
            let time = tag
                .as_ref()
                .and_then(|tag| tag.tagger())
                .map(|tagger| tagger.when().seconds())
                .or_else(|| commit.as_ref().map(|commit| commit.time().seconds()));
            entries.push(GitReferenceEntry {
                kind: kind.into(),
                name: reference.shorthand().unwrap_or_default().into(),
                sha: commit.as_ref().map(|commit| commit.id().to_string()),
                summary,
                time,
            });
        }
    }
    let mut remote_count = entries
        .iter()
        .filter(|entry| entry.kind == "remotes")
        .count();
    for name in repo.remotes()?.iter().flatten() {
        if !entries
            .iter()
            .any(|entry| entry.kind == "remotes" && entry.name.starts_with(&format!("{name}/")))
        {
            if remote_count >= 1000 {
                truncated = true;
                break;
            }
            remote_count += 1;
            entries.push(GitReferenceEntry {
                kind: "remotes".into(),
                name: name.into(),
                sha: None,
                summary: None,
                time: None,
            });
        }
    }
    repo.stash_foreach(|index, name, oid| {
        if index >= 1000 {
            truncated = true;
            return false;
        }
        entries.push(GitReferenceEntry {
            kind: "stashes".into(),
            name: format!("stash@{{{index}}}: {name}"),
            sha: Some(oid.to_string()),
            summary: None,
            time: None,
        });
        true
    })?;
    entries.sort_by(|left, right| {
        left.kind.cmp(&right.kind).then_with(|| {
            if left.kind == "tags" {
                tag_order(left, right)
            } else {
                left.name.cmp(&right.name)
            }
        })
    });
    Ok(GitReferences { entries, truncated })
}

fn tag_order(left: &GitReferenceEntry, right: &GitReferenceEntry) -> std::cmp::Ordering {
    let version = |name: &str| semver::Version::parse(name.strip_prefix('v').unwrap_or(name)).ok();
    match (version(&left.name), version(&right.name)) {
        (Some(left), Some(right)) => right.cmp(&left),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => right
            .time
            .cmp(&left.time)
            .then_with(|| right.name.cmp(&left.name)),
    }
}

#[cfg(test)]
mod tests;
