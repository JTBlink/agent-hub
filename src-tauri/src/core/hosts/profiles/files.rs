//! Flat Hosts text and metadata files share a recoverable transaction under RepoLock.
use super::{library, valid_id};
use crate::core::{central_repo, user_config};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
};

const PARTS: [(&str, &str); 2] = [("hosts", "hosts"), ("profile.json", "json")];

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Pending {
    id: String,
    staged: String,
    existing: bool,
    deleting: bool,
}

fn journal() -> std::path::PathBuf {
    central_repo::base_dir().join("hosts-files-write.json")
}

fn replace(source: &Path, target: &Path) -> Result<(), String> {
    user_config::checked(source)?;
    user_config::checked(target)?;
    let mut file =
        tempfile::NamedTempFile::new_in(target.parent().ok_or("HOSTS_PROFILE_RECOVERY")?)
            .map_err(|e| e.to_string())?;
    std::io::copy(
        &mut fs::File::open(source).map_err(|e| e.to_string())?,
        &mut file,
    )
    .map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.persist(target).map_err(|e| e.to_string())?;
    Ok(())
}

fn remove(path: &Path) -> Result<(), String> {
    user_config::checked(path)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Roll back incomplete paired writes; preserve any unknown external changes.
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
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e.to_string()),
    }
    if raw.len() > 4096 {
        return Err("HOSTS_PROFILE_RECOVERY".into());
    }
    let pending: Pending = serde_json::from_slice(&raw).map_err(|_| "HOSTS_PROFILE_RECOVERY")?;
    valid_id(&pending.id)?;
    if !pending.staged.starts_with(".tmp") || pending.staged.contains(['/', '\\', ':']) {
        return Err("HOSTS_PROFILE_RECOVERY".into());
    }
    let stage = central_repo::base_dir().join(&pending.staged);
    user_config::checked(&stage)?;
    // Check the entire pair before changing either file.
    for (part, extension) in PARTS {
        let target = library().join(format!("{}.{extension}", pending.id));
        let before = stage.join(format!("before-{part}"));
        let desired = stage.join(part);
        for path in [&target, &before, &desired] {
            user_config::checked(path)?;
        }
        let original = if pending.existing {
            Some(fs::read(&before).map_err(|e| e.to_string())?)
        } else {
            None
        };
        let replacement = if pending.deleting {
            None
        } else {
            Some(fs::read(&desired).map_err(|e| e.to_string())?)
        };
        match fs::read(&target) {
            Ok(current)
                if Some(&current) == original.as_ref()
                    || Some(&current) == replacement.as_ref() => {}
            Ok(_) => return Err("HOSTS_PROFILE_CONFLICT".into()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    for (part, extension) in PARTS {
        let target = library().join(format!("{}.{extension}", pending.id));
        if pending.existing {
            replace(&stage.join(format!("before-{part}")), &target)?;
        } else {
            remove(&target)?;
        }
    }
    fs::remove_file(journal()).map_err(|e| e.to_string())?;
    fs::remove_dir_all(stage).map_err(|e| e.to_string())
}

fn commit(
    id: &str,
    stage: tempfile::TempDir,
    existing: bool,
    deleting: bool,
) -> Result<(), String> {
    for (part, extension) in PARTS {
        let target = library().join(format!("{id}.{extension}"));
        user_config::checked(&target)?;
        if existing {
            replace(&target, &stage.path().join(format!("before-{part}")))?;
        } else if target.try_exists().map_err(|e| e.to_string())? {
            return Err("HOSTS_PROFILE_CONFLICT".into());
        }
    }
    let pending = Pending {
        id: id.to_owned(),
        staged: stage
            .path()
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or("HOSTS_PROFILE_RECOVERY")?
            .to_owned(),
        existing,
        deleting,
    };
    let mut record =
        tempfile::NamedTempFile::new_in(central_repo::base_dir()).map_err(|e| e.to_string())?;
    record
        .write_all(&serde_json::to_vec(&pending).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    record.as_file().sync_all().map_err(|e| e.to_string())?;
    user_config::checked(&journal())?;
    // Keep rollback copies alive before publishing the journal.
    let stage = stage.keep();
    if let Err(e) = record.persist(journal()) {
        let _ = fs::remove_dir_all(stage);
        return Err(e.to_string());
    }
    for (part, extension) in PARTS {
        let target = library().join(format!("{id}.{extension}"));
        if deleting {
            remove(&target)?;
        } else {
            replace(&stage.join(part), &target)?;
        }
    }
    fs::remove_file(journal()).map_err(|e| e.to_string())?;
    if let Err(e) = fs::remove_dir_all(stage) {
        log::debug!("Hosts staging cleanup: {e}");
    }
    Ok(())
}

pub(super) fn publish(id: &str, stage: tempfile::TempDir, existing: bool) -> Result<(), String> {
    commit(id, stage, existing, false)
}

pub(super) fn delete(id: &str) -> Result<(), String> {
    let stage = tempfile::tempdir_in(central_repo::base_dir()).map_err(|e| e.to_string())?;
    commit(id, stage, true, true)
}

#[cfg(test)]
mod tests;
