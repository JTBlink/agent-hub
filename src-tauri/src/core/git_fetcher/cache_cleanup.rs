use super::*;

/// Clear only generated full/sparse cache slots for an allowed remote URL.
/// Acquire every lock before deleting anything; a busy slot leaves both intact.
pub fn clear_repository_cache(url: &str) -> Result<()> {
    validate_git_url(url)?;
    let parsed = parse_git_source(url);
    clear_cache_slots(&[
        repo_cache_dir_for(&parsed.clone_url, false),
        repo_cache_dir_for(&parsed.clone_url, true),
    ])
}

fn clear_cache_slots(slots: &[PathBuf]) -> Result<()> {
    let mut locks = Vec::new();
    for slot in slots {
        let Some(parent) = slot.parent() else {
            bail!("Invalid cache slot");
        };
        if !parent.exists() {
            continue;
        }
        locks.push(
            RepoCacheLock::try_acquire(slot)
                .context("Repository cache is in use; try again after the operation finishes")?,
        );
    }
    for slot in slots {
        match std::fs::symlink_metadata(slot) {
            Ok(metadata) if metadata.is_symlink() => std::fs::remove_file(slot)?,
            Ok(_) => std::fs::remove_dir_all(slot)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;
