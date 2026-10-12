//! Separate an entry's physical identity from the content of a project link.
use super::{
    manifest::{fingerprint, LIBRARY},
    safe_name,
};
use crate::core::path_guard;
use anyhow::{bail, Context, Result};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};

/// Join a base path with a forward-slash relative string, splitting each `/`
/// component so `PathBuf::join` emits the platform separator on every segment.
fn portable_join(base: &Path, relative: &str) -> PathBuf {
    relative
        .split('/')
        .fold(base.to_path_buf(), |acc, part| acc.join(part))
}

/// Validate the directory entry itself, without following its final component.
/// Publication only renames/unlinks this component; parent links are forbidden.
pub(super) fn path(root: &Path, relative: &str) -> Result<PathBuf> {
    path_guard::ensure_safe_skill_relative_path(relative)
        .map_err(|err| anyhow::anyhow!(err.message))?;
    if relative.contains(['\\', ':']) {
        bail!("Invalid project relative path");
    }
    let target = portable_join(root, relative);
    let parent = target.parent().context("Project entry has no parent")?;
    for ancestor in parent.ancestors().take_while(|path| *path != root) {
        if fs::symlink_metadata(ancestor).is_ok_and(|meta| meta.file_type().is_symlink()) {
            bail!("Project path contains a symbolic link ancestor; migrate it explicitly");
        }
    }
    if !path_guard::is_path_safe(root, parent) {
        bail!("Project path escapes its workspace");
    }
    Ok(target)
}

/// Hash the link text itself for publication/recovery; never follow a link.
pub(super) fn fingerprint_entry(path: &Path) -> Result<Option<String>> {
    if fs::symlink_metadata(path).is_ok_and(|meta| meta.file_type().is_symlink()) {
        let target = fs::read_link(path)?;
        return Ok(Some(format!(
            "link:{:x}",
            Sha256::digest(
                target
                    .to_str()
                    .context("Project link destination must be valid Unicode")?
                    .replace(std::path::MAIN_SEPARATOR, "/")
                    .as_bytes()
            )
        )));
    }
    fingerprint(path)
}

/// An absent dedicated entry is not deployed; a broken link is still an entry.
pub(super) fn is_present(root: &Path, relative: &str) -> Result<bool> {
    match fs::symlink_metadata(path(root, relative)?) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

pub(super) fn link_destination(path: &Path) -> Result<PathBuf> {
    let destination = fs::read_link(path)?;
    Ok(path_guard::normalize(
        &path
            .parent()
            .context("Link has no parent")?
            .join(destination),
    ))
}

/// Only dedicated links to this project's same named central Skill are read.
pub(super) fn content_fingerprint(root: &Path, relative: &str) -> Result<Option<String>> {
    let entry = path(root, relative)?;
    if !entry.is_symlink() {
        return fingerprint(&entry);
    }
    let name = entry
        .file_name()
        .context("Skill entry has no name")?
        .to_string_lossy();
    safe_name(&name)?;
    let destinations = [
        format!("{LIBRARY}/{name}"),
        format!("{LIBRARY}-disabled/{name}"),
    ];
    let destination = link_destination(&entry)?;
    let canonical = destinations.iter().find(|candidate| portable_join(root, candidate) == destination && relative != candidate.as_str())
        .context("Project Skill link does not point to its project central content; migrate it explicitly")?;
    fingerprint(&super::safe_path(root, canonical)?)
}

pub(super) fn points_to(root: &Path, relative: &str, canonical: &str) -> bool {
    path(root, relative)
        .ok()
        .and_then(|path| link_destination(&path).ok())
        .is_some_and(|destination| destination == portable_join(root, canonical))
}

/// Relative project links survive a clone into a different directory.
pub(super) fn create_link(target: &Path, link: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(target, link)
    }
    #[cfg(windows)]
    {
        std::os::windows::fs::symlink_dir(target, link)
    }
}
