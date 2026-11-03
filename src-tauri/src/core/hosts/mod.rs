//! System hosts editing. The IPC never accepts a destination path.
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{io::Write, net::IpAddr, path::PathBuf, sync::Mutex};

mod archive;
mod elevation;
pub mod permissions;
pub mod profiles;
#[cfg(test)]
mod tests;

const MAX_BYTES: usize = 1024 * 1024;
static SAVE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Serialize)]
pub struct HostsSnapshot {
    pub path: String,
    pub content: String,
    pub revision: String,
    pub backup_warning: Option<String>,
    pub applied_profile_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct HostsSaved {
    pub snapshot: HostsSnapshot,
    pub backup_path: Option<String>,
}

fn system_path() -> PathBuf {
    #[cfg(windows)]
    {
        PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into()))
            .join("System32/drivers/etc/hosts")
    }
    #[cfg(not(windows))]
    PathBuf::from("/etc/hosts")
}

fn revision(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn read_path(path: &std::path::Path) -> Result<HostsSnapshot, String> {
    use std::io::Read;
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take((MAX_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > MAX_BYTES {
        return Err("HOSTS_TOO_LARGE".into());
    }
    let revision = revision(&bytes);
    let content = String::from_utf8(bytes).map_err(|_| "HOSTS_ENCODING")?;
    Ok(HostsSnapshot {
        path: path.to_string_lossy().into_owned(),
        content,
        revision,
        backup_warning: None,
        applied_profile_id: None,
    })
}

/// Read the operating system's hosts file without requesting administrator access.
pub fn read() -> Result<HostsSnapshot, String> {
    read_path(&system_path())
}

/// Capture actual local content in the existing portable configuration backup.
pub fn read_for_editor() -> Result<HostsSnapshot, String> {
    let lock = crate::core::repo_lock::RepoLock::acquire_foreground("capture system Hosts");
    let mut snapshot = read()?;
    snapshot.backup_warning = lock
        .map_err(|e| e.to_string())
        .and_then(|_lock| {
            snapshot.applied_profile_id = profiles::applied_id(&snapshot)?;
            archive::capture(&snapshot, false)
        })
        .err();
    Ok(snapshot)
}

fn validate(content: &str) -> Result<(), String> {
    if content.len() > MAX_BYTES {
        return Err("HOSTS_TOO_LARGE".into());
    }
    for (index, line) in content.trim_start_matches('\u{feff}').lines().enumerate() {
        let mut fields = line
            .split('#')
            .next()
            .unwrap_or_default()
            .split_whitespace();
        let Some(address) = fields.next() else {
            continue;
        };
        let names: Vec<_> = fields.collect();
        if address.parse::<IpAddr>().is_err()
            || names.is_empty()
            || names.iter().any(|name| {
                name.len() > 254
                    || name.trim_end_matches('.').split('.').any(|label| {
                        label.is_empty()
                            || label.len() > 63
                            || !label
                                .bytes()
                                .all(|b| b.is_ascii_alphanumeric() || b"-_".contains(&b))
                    })
            })
        {
            return Err(format!("HOSTS_INVALID_LINE:{}", index + 1));
        }
    }
    Ok(())
}

/// Preserve the original line-ending convention (textarea values normalize CRLF).
fn encode(content: &str, original: &str) -> String {
    let normalized = content.replace("\r\n", "\n");
    let normalized = if original.contains("\r\n") {
        normalized.replace('\n', "\r\n")
    } else {
        normalized
    };
    if original.starts_with('\u{feff}') && !normalized.starts_with('\u{feff}') {
        format!("\u{feff}{normalized}")
    } else {
        normalized
    }
}

/// Check for concurrent edits, back up the original, then save through a scoped helper.
pub fn save(content: &str, expected_revision: &str) -> Result<HostsSaved, String> {
    let _lock = crate::core::repo_lock::RepoLock::acquire_foreground("save system Hosts")
        .map_err(|e| e.to_string())?;
    save_unlocked(content, expected_revision, None)
}

pub(super) fn save_unlocked(
    content: &str,
    expected_revision: &str,
    profile_id: Option<&str>,
) -> Result<HostsSaved, String> {
    let _guard = SAVE_LOCK
        .lock()
        .map_err(|_| "Hosts save lock unavailable")?;
    let before = read()?;
    if before.revision != expected_revision {
        return Err("HOSTS_CONFLICT".into());
    }
    validate(content)?;
    archive::capture(&before, true)?;
    let applied = profiles::prepare_applied(
        profile_id,
        &revision(encode(content, &before.content).as_bytes()),
    )?;
    let mut result = save_path(&system_path(), content, expected_revision)?;
    let state_warning = profiles::commit_applied(applied).err();
    if state_warning.is_none() {
        result.snapshot.applied_profile_id = profile_id.map(str::to_owned);
    }
    result.snapshot.backup_warning = state_warning
        .into_iter()
        .chain(archive::capture(&result.snapshot, false).err())
        .reduce(|first, next| format!("{first}; {next}"));
    Ok(result)
}

fn save_path(path: &std::path::Path, content: &str, expected: &str) -> Result<HostsSaved, String> {
    if std::fs::symlink_metadata(path)
        .map_err(|e| e.to_string())?
        .file_type()
        .is_symlink()
    {
        return Err("HOSTS_INVALID_TARGET".into());
    }
    let before = read_path(path)?;
    if before.revision != expected {
        return Err("HOSTS_CONFLICT".into());
    }
    validate(content)?;
    let content = encode(content, &before.content);
    if content == before.content {
        return Ok(HostsSaved {
            snapshot: before,
            backup_path: None,
        });
    }
    // Resolve macOS's /etc alias before refusing symlinks in the privileged helper.
    #[cfg(not(windows))]
    let target = path.canonicalize().map_err(|e| e.to_string())?;
    #[cfg(windows)]
    let target = path.to_path_buf();
    let backup = target.with_file_name(format!("hosts.agent-hub-{}.bak", uuid::Uuid::new_v4()));
    let mut payload = tempfile::NamedTempFile::new().map_err(|e| e.to_string())?;
    payload
        .write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
    payload.flush().map_err(|e| e.to_string())?;
    elevation::write(
        &target,
        payload.path(),
        expected,
        &revision(content.as_bytes()),
        &backup,
    )?;
    let after = read_path(path)?;
    if after.revision != revision(content.as_bytes()) {
        return Err("HOSTS_VERIFY_FAILED".into());
    }
    Ok(HostsSaved {
        snapshot: after,
        backup_path: Some(backup.to_string_lossy().into_owned()),
    })
}
