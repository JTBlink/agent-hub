//! Migrate both historical directory layouts without changing IDs or revisions.
use super::{files, legacy_library, library, read_at, valid_id};
use crate::core::{auto_backup, central_repo, user_config};
use std::fs;

pub(super) fn run() -> Result<(), String> {
    let root = library();
    user_config::checked(&root)?;
    for source in [legacy_library(), root.clone()] {
        user_config::checked(&source)?;
        if !source.try_exists().map_err(|e| e.to_string())? {
            continue;
        }
        for entry in fs::read_dir(&source).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let id = entry
                .file_name()
                .into_string()
                .map_err(|_| "HOSTS_PROFILE_INVALID_ID")?;
            if uuid::Uuid::parse_str(&id).is_err() {
                continue;
            }
            valid_id(&id)?;
            user_config::checked(&entry.path())?;
            let original = read_at(&source, &id)?;
            // Refuse to discard files added by an external editor.
            for child in fs::read_dir(entry.path()).map_err(|e| e.to_string())? {
                let child = child.map_err(|e| e.to_string())?;
                if !matches!(child.file_name().to_str(), Some("hosts" | "profile.json")) {
                    return Err("HOSTS_PROFILE_CONFLICT".into());
                }
            }
            let target = root.join(format!("{id}.hosts"));
            user_config::checked(&target)?;
            let metadata = root.join(format!("{id}.json"));
            user_config::checked(&metadata)?;
            if target.exists() || metadata.exists() {
                let flat = super::read_files(&metadata, &target, &id)?;
                if flat.revision != original.revision {
                    return Err("HOSTS_PROFILE_CONFLICT".into());
                }
            } else {
                let stage =
                    tempfile::tempdir_in(central_repo::base_dir()).map_err(|e| e.to_string())?;
                for part in ["hosts", "profile.json"] {
                    fs::copy(entry.path().join(part), stage.path().join(part))
                        .map_err(|e| e.to_string())?;
                }
                files::publish(&id, stage, false)?;
            }
            // Recheck before removing the legacy copy so external edits survive.
            if read_at(&source, &id)?.revision != original.revision {
                return Err("HOSTS_PROFILE_CONFLICT".into());
            }
            fs::remove_dir_all(entry.path()).map_err(|e| e.to_string())?;
            auto_backup::notify_central_change();
        }
    }
    let legacy = legacy_library();
    if legacy.exists()
        && fs::read_dir(&legacy)
            .map_err(|e| e.to_string())?
            .next()
            .is_none()
    {
        fs::remove_dir(legacy).map_err(|e| e.to_string())?;
    }
    Ok(())
}
