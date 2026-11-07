//! Shared local state primitives. Callers retain their namespace, schema and storage ownership.
use anyhow::{Context, Result};
use serde_json::Value;
use std::path::{Path, PathBuf};

/// Python callers use the same transactional implementation instead of a task-local copy.
pub fn python_module() -> Result<PathBuf> {
    super::python_support::publish("state_store", include_str!("store.py"))
}

/// Read a checkpoint without resetting missing or malformed state or following a file symlink.
pub fn read_json(path: &Path) -> Result<Option<Value>> {
    let metadata = match path.symlink_metadata() {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    anyhow::ensure!(
        metadata.is_file() && !metadata.file_type().is_symlink(),
        "State must be a regular file"
    );
    Ok(Some(
        serde_json::from_slice(&std::fs::read(path)?)
            .context("State format is invalid; preserve the existing record")?,
    ))
}

#[cfg(test)]
mod tests;
