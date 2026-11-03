//! Replayable profile-directory replacement. Callers hold the shared RepoLock.
use super::{legacy_library, library, valid_id};
use crate::core::{central_repo, user_config};
use serde::{Deserialize, Serialize};
use std::{fs, io::Read};

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Pending {
    id: String,
    staged: String,
    previous: String,
}
fn journal() -> std::path::PathBuf {
    central_repo::base_dir().join("hosts-profile-write.json")
}

pub(super) fn recover() -> Result<(), String> {
    user_config::ready()?;
    user_config::checked(&journal())?;
    let mut raw = Vec::new();
    match fs::File::open(journal()) {
        Ok(file) => {
            file.take(4097)
                .read_to_end(&mut raw)
                .map_err(|e| e.to_string())?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
    }
    if raw.len() > 4096 {
        return Err("HOSTS_PROFILE_RECOVERY".into());
    }
    let pending: Pending = serde_json::from_slice(&raw).map_err(|_| "HOSTS_PROFILE_RECOVERY")?;
    valid_id(&pending.id)?;
    if !pending.staged.starts_with(".tmp")
        || pending.staged.contains(['/', '\\', ':'])
        || !pending.previous.starts_with("hosts-")
    {
        return Err("HOSTS_PROFILE_RECOVERY".into());
    }
    valid_id(pending.previous.trim_start_matches("hosts-"))?;
    let target = library().join(&pending.id);
    let legacy_target = legacy_library().join(&pending.id);
    let staged = central_repo::base_dir().join(&pending.staged);
    let previous = central_repo::base_dir()
        .join("recovery")
        .join(&pending.previous);
    for path in [&target, &legacy_target, &staged, &previous] {
        user_config::checked(path)?;
    }
    if !target.try_exists().map_err(|e| e.to_string())?
        && !legacy_target.try_exists().map_err(|e| e.to_string())?
    {
        fs::create_dir_all(library()).map_err(|e| e.to_string())?;
        fs::rename(&previous, &target).map_err(|e| format!("HOSTS_PROFILE_RECOVERY: {e}"))?;
    }
    // A live target is either the original or a completed replacement; never overwrite it.
    // Leave an existing recovery copy available for inspection after an interrupted write.
    if staged.try_exists().map_err(|e| e.to_string())? {
        fs::remove_dir_all(staged).map_err(|e| e.to_string())?;
    }
    fs::remove_file(journal()).map_err(|e| e.to_string())
}
