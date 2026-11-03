//! System snapshots join the ordinary configuration backup, without a second history UI.
//! Callers hold RepoLock; the device key is local and is never restored from Git.
use super::HostsSnapshot;
use crate::core::{auto_backup, central_repo, user_config};
use std::{fs, io::Write, path::Path};

fn device_id() -> Result<String, String> {
    let path = central_repo::base_dir().join("hosts-device-id");
    user_config::checked(&path)?;
    match fs::read_to_string(&path) {
        Ok(id) if uuid::Uuid::parse_str(&id).is_ok_and(|value| value.to_string() == id) => Ok(id),
        Ok(_) => Err("HOSTS_DEVICE_ID".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let id = uuid::Uuid::new_v4().to_string();
            write(&path, id.as_bytes())?;
            Ok(id)
        }
        Err(error) => Err(error.to_string()),
    }
}
fn write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    user_config::checked(path)?;
    let parent = path.parent().ok_or("USER_CONFIG_INVALID_PATH")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    if fs::read(path).is_ok_and(|old| old == bytes) {
        return Ok(());
    }
    if path.starts_with(user_config::root()) {
        user_config::check_file(path, bytes.len())?;
    }
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.persist(path).map_err(|e| e.to_string())?;
    auto_backup::notify_central_change();
    Ok(())
}
pub(super) fn capture(snapshot: &HostsSnapshot, previous: bool) -> Result<(), String> {
    user_config::ensure_root()?;
    let folder = user_config::root().join("hosts/systems").join(device_id()?);
    let filename = if previous {
        "previous.hosts"
    } else {
        "current.hosts"
    };
    write(&folder.join(filename), snapshot.content.as_bytes())
}

#[cfg(test)]
mod tests;
