//! Application provenance stays on this device and is never restored from Git.
use super::{library, read_at, valid_id};
use crate::core::{central_repo, hosts::HostsSnapshot, user_config};
use serde::{Deserialize, Serialize};
use std::{fs, io::Write, path::PathBuf};

#[derive(Serialize, Deserialize)]
struct Applied {
    id: Option<String>,
    system_revision: String,
}

fn path() -> PathBuf {
    central_repo::base_dir().join("hosts-applied-profile.json")
}

pub(in crate::core::hosts) fn applied_id(
    snapshot: &HostsSnapshot,
) -> Result<Option<String>, String> {
    let path = path();
    user_config::checked(&path)?;
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    let applied: Applied = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    let Some(id) = applied.id else {
        return Ok(None);
    };
    valid_id(&id)?;
    if applied.system_revision != snapshot.revision {
        return Ok(None);
    }
    user_config::checked(&library())?;
    // A removed or edited profile must not inherit an old active badge.
    Ok(read_at(&library(), &id)
        .ok()
        .filter(|profile| {
            super::super::encode(&profile.content, &snapshot.content) == snapshot.content
        })
        .map(|profile| profile.id))
}

/// Prepare the local write before requesting system-file authorization.
pub(in crate::core::hosts) fn prepare_applied(
    id: Option<&str>,
    system_revision: &str,
) -> Result<tempfile::NamedTempFile, String> {
    let path = path();
    user_config::checked(&path)?;
    fs::create_dir_all(central_repo::base_dir()).map_err(|e| e.to_string())?;
    let mut file =
        tempfile::NamedTempFile::new_in(central_repo::base_dir()).map_err(|e| e.to_string())?;
    let bytes = serde_json::to_vec(&Applied {
        id: id.map(str::to_owned),
        system_revision: system_revision.to_owned(),
    })
    .map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    Ok(file)
}

pub(in crate::core::hosts) fn commit_applied(file: tempfile::NamedTempFile) -> Result<(), String> {
    let path = path();
    user_config::checked(&path)?;
    file.persist(&path).map_err(|error| {
        // After a successful system write, never leave a previous profile attributed
        // to identical content if updating the receipt fails.
        let cleanup = match fs::remove_file(&path) {
            Ok(()) => String::new(),
            Err(cleanup) if cleanup.kind() == std::io::ErrorKind::NotFound => String::new(),
            Err(cleanup) => format!("; {cleanup}"),
        };
        format!("HOSTS_APPLIED_STATE: {error}{cleanup}")
    })?;
    Ok(())
}

#[cfg(test)]
mod tests;
