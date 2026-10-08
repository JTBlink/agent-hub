//! Strict copy and fingerprints for backup publication. Errors never mean absent.
use anyhow::{bail, Result};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs, path::Path};

pub(super) fn names(root: &Path) -> Result<Vec<String>> {
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut result = Vec::new();
    for entry in fs::read_dir(root)? {
        let name = entry?
            .file_name()
            .into_string()
            .map_err(|_| anyhow::anyhow!("Backup requires UTF-8 file names"))?;
        result.push(name);
    }
    result.sort();
    Ok(result)
}

pub(super) fn content_name(name: &str) -> bool {
    !matches!(
        name,
        ".git"
            | ".agent-hub"
            | ".gitignore"
            | ".skill-lock.json"
            | ".DS_Store"
            | "agent-hub.db"
            | "agent-hub.db-wal"
            | "agent-hub.db-shm"
            | "repo-config.json"
            | "library.lock"
            | "logs"
            | "cache"
            | "recovery"
            | "shared-skills-layout.json"
            | "shared-skills-migration.json"
            | ".secret.key"
            | "credentials"
            | "backup"
            | "backup-publication.json"
            | "backup-publication.tmp"
    )
}

pub(super) fn copy(source: &Path, target: &Path, follow_links: bool) -> Result<()> {
    copy_impl(source, target, follow_links, false)
}

pub(super) fn copy_skill(source: &Path, target: &Path) -> Result<()> {
    copy_impl(source, target, true, true)
}

fn copy_impl(source: &Path, target: &Path, follow_links: bool, skip_git: bool) -> Result<()> {
    for entry in walkdir::WalkDir::new(source)
        .follow_links(follow_links)
        .into_iter()
        .filter_entry(|entry| !skip_git || entry.file_name() != ".git")
    {
        let entry = entry?;
        if entry.file_type().is_symlink() {
            bail!("Backup contains a symbolic link; restore requires portable Skill files");
        }
        let relative = entry.path().strip_prefix(source)?;
        let dest = if relative.as_os_str().is_empty() {
            target.to_owned()
        } else {
            target.join(relative)
        };
        if entry.file_type().is_dir() {
            fs::create_dir_all(&dest)?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(entry.path(), dest)?;
        } else {
            bail!("Unsupported backup entry");
        }
    }
    Ok(())
}

pub(super) fn remove(path: &Path) -> Result<()> {
    match path.symlink_metadata() {
        Ok(meta) if meta.is_dir() => fs::remove_dir_all(path)?,
        Ok(_) => fs::remove_file(path)?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.into()),
    }
    Ok(())
}

pub(super) fn fingerprint(path: &Path) -> Result<Option<String>> {
    if path
        .symlink_metadata()
        .is_err_and(|e| e.kind() == std::io::ErrorKind::NotFound)
    {
        return Ok(None);
    }
    let mut hash = Sha256::new();
    for entry in walkdir::WalkDir::new(path)
        .follow_links(true)
        .sort_by_file_name()
        .into_iter()
        .filter_entry(|entry| entry.file_name() != ".git")
    {
        let entry = entry?;
        hash.update(
            entry
                .path()
                .strip_prefix(path)?
                .to_string_lossy()
                .as_bytes(),
        );
        hash.update([0]);
        hash.update([u8::from(entry.file_type().is_dir())]);
        if entry.file_type().is_file() {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                hash.update((entry.metadata()?.permissions().mode() & 0o111).to_le_bytes());
            }
            let mut file = fs::File::open(entry.path())?;
            std::io::copy(&mut file, &mut hash)?;
        }
        hash.update([0]);
    }
    Ok(Some(format!("{:x}", hash.finalize())))
}

pub(super) fn snapshot(root: &Path) -> Result<BTreeMap<String, String>> {
    let mut result = BTreeMap::new();
    for name in names(root)? {
        if content_name(&name) {
            if let Some(hash) = fingerprint(&root.join(&name))? {
                result.insert(name, hash);
            }
        }
    }
    Ok(result)
}
