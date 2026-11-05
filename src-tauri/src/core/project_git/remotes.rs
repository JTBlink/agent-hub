//! Local fetch addresses for explicit clipboard actions; no network access.
use super::actions::repository;
use crate::core::git_credentials::split_credentials_from_url;
use anyhow::{Context, Result};
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
pub struct GitRemote {
    pub name: String,
    pub url: String,
}

pub fn remotes(root: &Path) -> Result<Vec<GitRemote>> {
    let repo = repository(root)?;
    let mut remotes = Vec::new();
    for name in repo.remotes()?.iter() {
        let name = name.context("Remote name is not valid UTF-8")?;
        let remote = repo.find_remote(name)?;
        let url = remote
            .url()
            .context("Remote URL is not valid UTF-8")?
            .trim();
        if url.is_empty() {
            continue;
        }
        let url = split_credentials_from_url(url)
            .map(|(_, sanitized)| sanitized)
            .unwrap_or_else(|| url.to_owned());
        remotes.push(GitRemote {
            name: name.to_owned(),
            url,
        });
    }
    remotes.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(remotes)
}

#[cfg(test)]
mod tests;
