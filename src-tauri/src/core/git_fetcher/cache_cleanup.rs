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
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn clears_full_and_sparse_slots_but_keeps_unrelated_content_and_lock_files() {
        let root = tempdir().unwrap();
        let slots = [root.path().join("repo"), root.path().join("repo-sparse")];
        for path in &slots {
            std::fs::create_dir(path).unwrap();
        }
        let other = root.path().join("other");
        std::fs::create_dir(&other).unwrap();
        clear_cache_slots(&slots).unwrap();
        assert!(slots
            .iter()
            .all(|path| !path.exists() && path.with_extension("lock").exists()));
        assert!(other.exists());
        clear_cache_slots(&slots).unwrap();
    }

    #[test]
    fn busy_sparse_slot_prevents_partial_cleanup() {
        let root = tempdir().unwrap();
        let slots = [root.path().join("repo"), root.path().join("repo-sparse")];
        for path in &slots {
            std::fs::create_dir(path).unwrap();
        }
        let _lock = lock_repo_cache(&slots[1], &None).unwrap();
        assert!(clear_cache_slots(&slots).is_err());
        assert!(slots.iter().all(|path| path.exists()));
    }

    #[cfg(unix)]
    #[test]
    fn clearing_a_cache_symlink_keeps_its_target() {
        let root = tempdir().unwrap();
        let outside = tempdir().unwrap();
        let file = outside.path().join("keep");
        std::fs::write(&file, "content").unwrap();
        let slot = root.path().join("repo");
        std::os::unix::fs::symlink(outside.path(), &slot).unwrap();
        clear_cache_slots(&[slot]).unwrap();
        assert_eq!(std::fs::read_to_string(file).unwrap(), "content");
    }
}
