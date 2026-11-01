use super::ProgressCallback;
use anyhow::{Context, Result};
use fs2::FileExt;
use std::fs::{File, OpenOptions};
use std::path::Path;

/// Own an acquired cache lock and release it at the operation boundary.
pub(super) struct RepoCacheLock {
    file: File,
}

impl RepoCacheLock {
    pub(super) fn try_acquire(slot: &Path) -> Result<Self> {
        let file = open_lock_file(slot)?;
        file.try_lock_exclusive()?;
        Ok(Self { file })
    }
}

impl Drop for RepoCacheLock {
    fn drop(&mut self) {
        // Closing only this handle is insufficient if another thread spawned a
        // child that inherited its open file description before exec.
        let _ = FileExt::unlock(&self.file);
    }
}

fn open_lock_file(slot: &Path) -> Result<File> {
    if let Some(parent) = slot.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let path = slot.with_extension("lock");
    OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(&path)
        .with_context(|| format!("Failed to open repo cache lock {}", path.display()))
}

pub(super) fn lock_repo_cache(
    slot: &Path,
    on_progress: &Option<ProgressCallback>,
) -> Result<RepoCacheLock> {
    let file = open_lock_file(slot)?;
    if file.try_lock_exclusive().is_err() {
        if let Some(callback) = on_progress {
            callback("Waiting for another install of this repository to finish…");
        }
        file.lock_exclusive()
            .with_context(|| format!("Failed to lock repo cache {}", slot.display()))?;
    }
    Ok(RepoCacheLock { file })
}

#[cfg(test)]
mod tests;
