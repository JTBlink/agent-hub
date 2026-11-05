//! Portable user configuration. Device state and credentials live elsewhere.
use std::{
    fs,
    path::{Path, PathBuf},
};

pub fn root() -> PathBuf {
    super::central_repo::base_dir().join("user-config")
}

/// Refuse links at every component below the app directory, including missing targets.
pub(crate) fn checked(path: &Path) -> Result<(), String> {
    let base = super::central_repo::base_dir();
    let relative = path
        .strip_prefix(&base)
        .map_err(|_| "USER_CONFIG_INVALID_PATH")?;
    let mut current = base;
    for component in relative.components() {
        if !matches!(component, std::path::Component::Normal(_)) {
            return Err("USER_CONFIG_INVALID_PATH".into());
        }
        current.push(component);
        match fs::symlink_metadata(&current) {
            Ok(meta) if super::path_guard::is_link_or_reparse_point(&meta) => {
                return Err("USER_CONFIG_LINK".into())
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}

pub(crate) fn ensure_root() -> Result<PathBuf, String> {
    ready()?;
    let path = root();
    checked(&path)?;
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    let marker = path.join("schema.json");
    checked(&marker)?;
    if !marker.exists() {
        let bytes = b"{\"schema_version\":1}\n";
        check_file(&marker, bytes.len())?;
        fs::write(&marker, bytes).map_err(|e| e.to_string())?;
    }
    Ok(path)
}

/// Writes must wait for the existing backup publication recovery.
pub(crate) fn ready() -> Result<(), String> {
    if super::central_repo::base_dir()
        .join("backup-publication.json")
        .try_exists()
        .map_err(|e| e.to_string())?
    {
        return Err("USER_CONFIG_RECOVERY_PENDING".into());
    }
    Ok(())
}

const MAX_BYTES: u64 = 32 * 1024 * 1024;
const MAX_ENTRIES: usize = 16384;
#[derive(Default)]
struct Size {
    bytes: u64,
    entries: usize,
}
fn size(root: &Path) -> anyhow::Result<Size> {
    let metadata = match root.symlink_metadata() {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Size::default()),
        Err(error) => return Err(error.into()),
    };
    if metadata.is_file() {
        anyhow::ensure!(
            !super::path_guard::is_link_or_reparse_point(&metadata),
            "USER_CONFIG_LINK"
        );
        return Ok(Size {
            bytes: metadata.len(),
            entries: 1,
        });
    }
    anyhow::ensure!(metadata.is_dir(), "Invalid user configuration directory");
    let mut size = Size::default();
    for (index, entry) in walkdir::WalkDir::new(root)
        .follow_links(false)
        .max_depth(12)
        .into_iter()
        .enumerate()
    {
        anyhow::ensure!(index < MAX_ENTRIES, "USER_CONFIG_TOO_LARGE");
        let entry = entry?;
        let metadata = fs::symlink_metadata(entry.path())?;
        anyhow::ensure!(
            !super::path_guard::is_link_or_reparse_point(&metadata),
            "USER_CONFIG_LINK"
        );
        anyhow::ensure!(
            metadata.is_dir() || metadata.is_file(),
            "Invalid user configuration entry"
        );
        anyhow::ensure!(entry.depth() < 12, "User configuration nesting is too deep");
        size.entries += 1;
        if metadata.is_file() {
            anyhow::ensure!(metadata.len() <= 1024 * 1024, "USER_CONFIG_TOO_LARGE");
            size.bytes += metadata.len();
        }
    }
    Ok(size)
}
/// Bounded traversal is used for both local export and untrusted Git restores.
#[cfg(any(feature = "cloud-sync", test))]
pub(crate) fn validate_tree(root: &Path) -> anyhow::Result<()> {
    if let Ok(metadata) = root.symlink_metadata() {
        anyhow::ensure!(metadata.is_dir(), "Invalid user configuration directory");
    }
    let size = size(root)?;
    anyhow::ensure!(size.bytes <= MAX_BYTES, "USER_CONFIG_TOO_LARGE");
    Ok(())
}
pub(crate) fn check_replacements(paths: &[(&Path, &Path)]) -> Result<(), String> {
    let total = size(&root()).map_err(|e| e.to_string())?;
    let mut old = Size::default();
    let mut next = Size::default();
    for (target, staged) in paths {
        let before = size(target).map_err(|e| e.to_string())?;
        let after = size(staged).map_err(|e| e.to_string())?;
        old.bytes += before.bytes;
        old.entries += before.entries;
        next.bytes += after.bytes;
        next.entries += after.entries;
    }
    if total.bytes.saturating_sub(old.bytes) + next.bytes > MAX_BYTES
        || total.entries.saturating_sub(old.entries) + next.entries > MAX_ENTRIES
    {
        return Err("USER_CONFIG_TOO_LARGE".into());
    }
    Ok(())
}
pub(crate) fn check_file(target: &Path, bytes: usize) -> Result<(), String> {
    let total = size(&root()).map_err(|e| e.to_string())?;
    let old = size(target).map_err(|e| e.to_string())?;
    if total.bytes.saturating_sub(old.bytes) + bytes as u64 > MAX_BYTES
        || total.entries.saturating_sub(old.entries) + 1 > MAX_ENTRIES
    {
        return Err("USER_CONFIG_TOO_LARGE".into());
    }
    Ok(())
}
