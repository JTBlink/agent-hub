//! Publish shared Python modules once per content revision, independent of task packages.
use anyhow::{bail, Context, Result};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

pub(crate) fn interpreter() -> Result<PathBuf> {
    for name in ["python3", "python"] {
        if let Some(path) = super::tool_detection::find_command(name) {
            if super::cli_process::capture(
                &path.to_string_lossy(),
                &["--version"],
                &[],
                5,
                None,
                None,
            )
            .is_ok_and(|(version, _)| version.trim().starts_with("Python 3."))
            {
                return Ok(path);
            }
        }
    }
    bail!("Python 3 is required for AgentHub scripts; install Python 3 and restart AgentHub")
}

/// Immutable revisions let an older in-flight execution finish during a CLI upgrade.
pub(crate) fn publish(name: &str, source: &str) -> Result<PathBuf> {
    publish_at(
        &super::central_repo::base_dir().join("runtime/core"),
        name,
        source,
    )
}

fn directory(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => Ok(()),
        Ok(_) => bail!("Shared runtime paths must be regular directories"),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => match fs::create_dir(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => directory(path),
            Err(error) => Err(error.into()),
        },
        Err(error) => Err(error.into()),
    }
}

pub(crate) fn publish_at(root: &Path, name: &str, source: &str) -> Result<PathBuf> {
    anyhow::ensure!(
        name.bytes().all(|c| c.is_ascii_lowercase() || c == b'_') && !name.is_empty(),
        "Invalid shared module name"
    );
    let parent = root.parent().context("Shared runtime has no parent")?;
    // The configured data root can be relocated; only these owned descendants are managed.
    fs::create_dir_all(parent.parent().context("Shared runtime has no data root")?)?;
    directory(parent)?;
    directory(root)?;
    let module = root.join(name);
    directory(&module)?;
    let revision = module.join(hex::encode(Sha256::digest(source.as_bytes())));
    directory(&revision)?;
    let path = revision.join(format!("{name}.py"));
    if path.symlink_metadata().is_ok() {
        verify(&path, source)?;
        return Ok(path);
    }
    let mut temporary = tempfile::NamedTempFile::new_in(&revision)?;
    temporary.write_all(source.as_bytes())?;
    temporary.as_file().sync_all()?;
    match temporary.persist_noclobber(&path) {
        Ok(_) => {}
        Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(error) => return Err(error.error.into()),
    }
    verify(&path, source)?;
    Ok(path)
}

fn verify(path: &Path, source: &str) -> Result<()> {
    let metadata = path.symlink_metadata()?;
    anyhow::ensure!(
        metadata.is_file() && !metadata.file_type().is_symlink(),
        "Shared module must be a regular file"
    );
    anyhow::ensure!(
        fs::read(path)? == source.as_bytes(),
        "Shared module content changed; preserve it and repair the runtime before executing"
    );
    Ok(())
}

#[cfg(test)]
mod tests;
