//! Replayable profile-directory replacement. Callers hold the shared RepoLock.
use super::{legacy_library, library, valid_id};
use crate::core::{central_repo, user_config};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
};

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

pub(super) fn publish(id: &str, stage: tempfile::TempDir, existing: bool) -> Result<(), String> {
    let target = library().join(id);
    if !existing {
        return fs::rename(stage.path(), target).map_err(|e| e.to_string());
    }
    let previous = format!("hosts-{}", uuid::Uuid::new_v4());
    let recovery = central_repo::base_dir().join("recovery").join(&previous);
    user_config::checked(&recovery)?;
    fs::create_dir_all(recovery.parent().ok_or("HOSTS_PROFILE_RECOVERY")?)
        .map_err(|e| e.to_string())?;
    let staged = stage.keep();
    let pending = Pending {
        id: id.to_owned(),
        staged: staged
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or("HOSTS_PROFILE_RECOVERY")?
            .to_owned(),
        previous,
    };
    let record = (|| {
        let mut file =
            tempfile::NamedTempFile::new_in(central_repo::base_dir()).map_err(|e| e.to_string())?;
        file.write_all(&serde_json::to_vec(&pending).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        file.as_file().sync_all().map_err(|e| e.to_string())?;
        file.persist(journal()).map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    })();
    if let Err(error) = record {
        let _ = fs::remove_dir_all(staged);
        return Err(error);
    }
    fs::rename(&target, &recovery).map_err(|e| e.to_string())?;
    fs::rename(&staged, &target).map_err(|e| e.to_string())?;
    fs::remove_file(journal()).map_err(|e| e.to_string())?;
    if let Err(error) = fs::remove_dir_all(recovery) {
        log::debug!("Profile recovery cleanup: {error}");
    }
    Ok(())
}
