//! Project the independent user configuration tree under the existing repo lock.
use super::{files, Journal};
use crate::core::user_config;
use anyhow::{bail, Result};
use std::{collections::BTreeMap, fs, path::Path};

type Fingerprints = BTreeMap<String, String>;
fn snapshot(root: &Path) -> Result<Fingerprints> {
    user_config::validate_tree(root)?;
    files::snapshot(root)
}

pub(super) fn export(repository: &Path) -> Result<Fingerprints> {
    let source = user_config::root();
    user_config::checked(&source).map_err(anyhow::Error::msg)?;
    let before = snapshot(&source)?;
    crate::core::agent_launch_config::validate_at(&source)?;
    let target = repository.join("user-config");
    if before != snapshot(&target)? {
        let stage = tempfile::tempdir_in(repository)?;
        let staged = stage.path().join("user-config");
        fs::create_dir(&staged)?;
        if source.exists() {
            files::copy(&source, &staged, false)?;
        }
        if before != snapshot(&source)? || before != snapshot(&staged)? {
            bail!("User configuration changed during backup; retry sync");
        }
        files::remove(&target)?;
        fs::rename(staged, target)?;
    }
    Ok(before)
}

/// Stage and validate before any live content is moved by the transaction.
pub(super) fn stage(journal: &Journal, repository: &Path, stage: &Path) -> Result<bool> {
    let Some(before) = &journal.user_config_before else {
        return Ok(false);
    };
    let source = repository.join("user-config");
    // Backups created before this feature do not own the configuration library.
    if !source.try_exists()? {
        return Ok(false);
    }
    let desired = snapshot(&source)?;
    crate::core::agent_launch_config::validate_at(&source)?;
    let hosts = source.join("hosts");
    crate::core::hosts::profiles::list_at(&hosts).map_err(anyhow::Error::msg)?;
    crate::core::hosts::profiles::list_at(&hosts.join("profiles")).map_err(anyhow::Error::msg)?;
    if before == &desired {
        return Ok(false);
    }
    let target = user_config::root();
    user_config::checked(&target).map_err(anyhow::Error::msg)?;
    let current = snapshot(&target)?;
    if &current != before
        && current != desired
        && !(current.is_empty() && journal.recovery.join("user-config").exists())
    {
        bail!("User configuration changed while syncing; preserve local edits and retry");
    }
    files::copy(&source, &stage.join("user-config"), false)?;
    Ok(true)
}

pub(super) fn publish(journal: &Journal, stage: &Path) -> Result<()> {
    let target = user_config::root();
    let staged = stage.join("user-config");
    let desired = snapshot(&staged)?;
    let current = snapshot(&target)?;
    if current == desired {
        return Ok(());
    }
    let recovery = journal.recovery.join("user-config");
    if journal.user_config_before.as_ref() != Some(&current)
        && !(current.is_empty() && recovery.exists())
    {
        bail!("User configuration changed during restore; original and backup retained");
    }
    user_config::checked(&target).map_err(anyhow::Error::msg)?;
    if target.exists() {
        if recovery.exists() {
            bail!("User configuration recovery already exists; local files preserved");
        }
        fs::create_dir_all(&journal.recovery)?;
        fs::rename(&target, &recovery)?;
    }
    fs::rename(staged, target)?;
    Ok(())
}
