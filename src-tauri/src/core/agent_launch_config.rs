//! Host persistence for shared Agent launch preferences.
use super::{cloud_sync, repo_lock::RepoLock, user_config};
use agent_hub_core::agent_launch::{default_instructions, normalize, resolve_document};
use anyhow::{bail, ensure, Context, Result};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    io::{Read, Write},
    path::Path,
};

mod edit;
pub use agent_hub_core::agent_launch::{
    key_for_kind, kind_for_key, parse, plan_fingerprint, verify_plan, AgentSchemes, Document,
    Launch, LaunchScheme,
};
pub use edit::{edit_schemes, effective_schemes, set_default_agent, SchemeEdit};

#[cfg(test)]
mod scheme_tests;
#[cfg(test)]
mod tests;

const FILE: &str = "agent-launch.json";

/// Return the single user-editable file backing shared Agent launch settings.
pub fn file_path() -> Result<String> {
    user_config::ready().map_err(anyhow::Error::msg)?;
    let root = user_config::root();
    let path = root.join(FILE);
    user_config::checked(&path).map_err(anyhow::Error::msg)?;
    Ok(path.to_string_lossy().into_owned())
}

#[derive(Serialize)]
pub struct Snapshot {
    pub document: Document,
    pub revision: String,
    pub defaults: BTreeMap<String, String>,
}

fn read(root: &Path) -> Result<(Document, String)> {
    let path = root.join(FILE);
    let mut bytes = Vec::new();
    let mut exists = true;
    match fs::File::open(path) {
        Ok(file) => {
            file.take(1024 * 1024 + 1).read_to_end(&mut bytes)?;
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            exists = false;
        }
        Err(e) => return Err(e.into()),
    }
    ensure!(
        bytes.len() <= 1024 * 1024,
        "Agent launch configuration is too large"
    );
    let document = if !exists {
        Document::default()
    } else {
        serde_json::from_slice(&bytes).context("Invalid Agent launch configuration")?
    };
    let document = normalize(document)?;
    Ok((document, hex::encode(Sha256::digest(&bytes))))
}
/// Validate restored configuration before the backup transaction publishes any files.
/// Caller validates the containing tree's symlink and size boundaries first.
#[cfg(feature = "cloud-sync")]
pub(crate) fn validate_at(root: &Path) -> Result<()> {
    read(root).map(|_| ())
}
fn load_unlocked() -> Result<Snapshot> {
    super::cloud_sync::recover_for_user_config()?;
    read_snapshot()
}
fn read_snapshot() -> Result<Snapshot> {
    let root = user_config::root();
    user_config::checked(&root.join(FILE)).map_err(anyhow::Error::msg)?;
    let (document, revision) = read(&root)?;
    Ok(Snapshot {
        document,
        revision,
        defaults: default_instructions(),
    })
}
pub fn load() -> Result<Snapshot> {
    // Saves replace this small file atomically. Ordinary reads need not queue
    // behind unrelated skill scans or Git network operations holding RepoLock.
    // A restore moves the whole directory under a publication journal: check
    // it around both reads so a transient missing file cannot become defaults
    // if a complete publication happens between two checks.
    let optimistic = || -> Result<Snapshot> {
        user_config::ready().map_err(anyhow::Error::msg)?;
        let before = read_snapshot()?;
        user_config::ready().map_err(anyhow::Error::msg)?;
        let after = read_snapshot()?;
        user_config::ready().map_err(anyhow::Error::msg)?;
        ensure!(
            before.revision == after.revision,
            "Agent launch settings changed while reading"
        );
        Ok(after)
    };
    if let Ok(snapshot) = optimistic() {
        return Ok(snapshot);
    }
    // Contended publication, invalid data and recovery retain the existing
    // serialized path and its errors. Writes always retain revision protection.
    let _lock = RepoLock::acquire_foreground("read Agent launch settings")?;
    load_unlocked()
}
/// Compare-and-replace; drafts from another window or a prior restore cannot overwrite edits.
pub fn save(document: Document, expected_revision: &str) -> Result<Snapshot> {
    let document = normalize(document)?;
    let _lock = RepoLock::acquire_foreground("save Agent launch settings")?;
    let current = load_unlocked()?;
    ensure!(
        current.revision == expected_revision,
        "Agent launch settings changed; reload before saving. Your draft is preserved."
    );
    let root = user_config::ensure_root().map_err(anyhow::Error::msg)?;
    let path = root.join(FILE);
    let bytes = serde_json::to_vec_pretty(&document)?;
    ensure!(
        bytes.len() <= 1024 * 1024,
        "Agent launch configuration is too large"
    );
    user_config::check_file(&path, bytes.len()).map_err(anyhow::Error::msg)?;
    let mut staged = tempfile::NamedTempFile::new_in(&root)?;
    staged.write_all(&bytes)?;
    staged.as_file().sync_all()?;
    user_config::checked(&path).map_err(anyhow::Error::msg)?;
    if read(&root)?.1 != expected_revision {
        bail!("Agent launch settings changed while saving; draft preserved")
    }
    staged.persist(&path).map_err(|e| e.error)?;
    cloud_sync::notify_central_change();
    load_unlocked()
}
pub fn resolve(agent: &str) -> Result<Launch> {
    resolve_scheme(agent, None)
}

/// Resolve an optional stable scheme reference without changing global defaults.
pub fn resolve_scheme(agent: &str, scheme_id: Option<&str>) -> Result<Launch> {
    resolve_document(&load()?.document, agent, scheme_id)
}
