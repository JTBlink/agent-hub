//! Complete Hosts profiles; file contents are authoritative and editor-friendly.
use super::{read_path, revision, validate, HostsSaved};
use crate::core::{auto_backup, repo_lock::RepoLock, user_config};
use serde::{Deserialize, Serialize};
use std::{fs, io::Write, path::Path};

mod applied;
mod files;
mod migration;
mod storage;
pub(super) use applied::{applied_id, commit_applied, prepare_applied};
#[cfg(test)]
mod tests;

#[derive(Debug, Clone, Serialize)]
pub struct HostsProfile {
    pub id: String,
    pub name: String,
    pub content: String,
    pub revision: String,
    pub path: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Metadata {
    schema_version: u32,
    id: String,
    name: String,
}

fn library() -> std::path::PathBuf {
    user_config::root().join("hosts")
}
fn legacy_library() -> std::path::PathBuf {
    library().join("profiles")
}
fn valid_id(id: &str) -> Result<(), String> {
    if uuid::Uuid::parse_str(id).is_ok_and(|value| value.to_string() == id) {
        Ok(())
    } else {
        Err("HOSTS_PROFILE_INVALID_ID".into())
    }
}
fn name(value: &str) -> Result<&str, String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 200 || value.chars().any(char::is_control) {
        return Err("HOSTS_PROFILE_INVALID_NAME".into());
    }
    Ok(value)
}
fn read_at(root: &Path, id: &str) -> Result<HostsProfile, String> {
    valid_id(id)?;
    let dir = root.join(id);
    let (metadata_path, content_path) = if dir.try_exists().map_err(|e| e.to_string())? {
        (dir.join("profile.json"), dir.join("hosts"))
    } else {
        (
            root.join(format!("{id}.json")),
            root.join(format!("{id}.hosts")),
        )
    };
    if dir
        .symlink_metadata()
        .is_ok_and(|meta| crate::core::path_guard::is_link_or_reparse_point(&meta))
    {
        return Err("USER_CONFIG_LINK".into());
    }
    read_files(&metadata_path, &content_path, id)
}

fn read_files(metadata_path: &Path, content_path: &Path, id: &str) -> Result<HostsProfile, String> {
    for path in [metadata_path, content_path] {
        if path
            .symlink_metadata()
            .is_ok_and(|meta| crate::core::path_guard::is_link_or_reparse_point(&meta))
        {
            return Err("USER_CONFIG_LINK".into());
        }
    }
    let raw = read_path(metadata_path)?.content.into_bytes();
    if raw.len() > 4096 {
        return Err("HOSTS_PROFILE_METADATA".into());
    }
    let metadata: Metadata = serde_json::from_slice(&raw).map_err(|_| "HOSTS_PROFILE_METADATA")?;
    if metadata.schema_version != 1 || metadata.id != id {
        return Err("HOSTS_PROFILE_METADATA".into());
    }
    name(&metadata.name)?;
    let snapshot = read_path(content_path)?;
    // Allow externally edited, temporarily invalid text to be displayed and corrected.
    let revision = revision(&[raw, snapshot.content.as_bytes().to_vec()].concat());
    Ok(HostsProfile {
        id: id.to_owned(),
        name: metadata.name,
        content: snapshot.content,
        revision,
        path: snapshot.path,
    })
}

/// List portable profiles without requesting system-file privileges.
pub fn list() -> Result<Vec<HostsProfile>, String> {
    let _lock = RepoLock::acquire_foreground("read Hosts profiles").map_err(|e| e.to_string())?;
    storage::recover()?;
    files::recover()?;
    migration::run()?;
    user_config::checked(&library())?;
    list_at(&library())
}
pub(crate) fn list_at(root: &Path) -> Result<Vec<HostsProfile>, String> {
    if !root.try_exists().map_err(|e| e.to_string())? {
        return Ok(Vec::new());
    }
    if root
        .symlink_metadata()
        .is_ok_and(|meta| crate::core::path_guard::is_link_or_reparse_point(&meta))
    {
        return Err("USER_CONFIG_LINK".into());
    }
    let mut result = Vec::new();
    let mut bytes = 0;
    for entry in fs::read_dir(root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let id = entry
            .file_name()
            .into_string()
            .map_err(|_| "HOSTS_PROFILE_INVALID_ID")?;
        if matches!(id.as_str(), ".DS_Store" | "profiles" | "systems") {
            continue;
        }
        let id = if let Some(id) = id.strip_suffix(".hosts") {
            if root.join(id).exists() {
                return Err("HOSTS_PROFILE_CONFLICT".into());
            }
            id.to_owned()
        } else if let Some(id) = id.strip_suffix(".json") {
            valid_id(id)?;
            if !root
                .join(format!("{id}.hosts"))
                .try_exists()
                .map_err(|e| e.to_string())?
            {
                return Err("HOSTS_PROFILE_METADATA".into());
            }
            continue;
        } else {
            id
        };
        if result.len() >= 1000 {
            return Err("HOSTS_PROFILE_LIMIT".into());
        }
        let profile = read_at(root, &id)?;
        bytes += profile.content.len();
        if bytes > 32 * 1024 * 1024 {
            return Err("HOSTS_PROFILE_LIMIT".into());
        }
        result.push(profile);
    }
    result.sort_by(|a, b| a.name.cmp(&b.name).then(a.id.cmp(&b.id)));
    Ok(result)
}

fn write(
    id: &str,
    title: &str,
    content: &str,
    existing: Option<&HostsProfile>,
) -> Result<HostsProfile, String> {
    let title = name(title)?;
    validate(content)?;
    user_config::ensure_root()?;
    user_config::checked(&library())?;
    fs::create_dir_all(library()).map_err(|e| e.to_string())?;
    let target = library().join(format!("{id}.hosts"));
    user_config::checked(&target)?;
    let stage =
        tempfile::tempdir_in(crate::core::central_repo::base_dir()).map_err(|e| e.to_string())?;
    let metadata = Metadata {
        schema_version: 1,
        id: id.to_owned(),
        name: title.to_owned(),
    };
    for (file, bytes) in [
        (
            "profile.json",
            serde_json::to_vec_pretty(&metadata).map_err(|e| e.to_string())?,
        ),
        ("hosts", content.as_bytes().to_vec()),
    ] {
        let mut file = fs::File::create(stage.path().join(file)).map_err(|e| e.to_string())?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }
    // Re-read after staging so an editor save cannot be silently replaced.
    if let Some(before) = existing {
        if read_at(&library(), id)?.revision != before.revision {
            return Err("HOSTS_PROFILE_CONFLICT".into());
        }
    } else if target.exists() {
        return Err("HOSTS_PROFILE_CONFLICT".into());
    }
    user_config::check_replacements(&[
        (&target, &stage.path().join("hosts")),
        (
            &library().join(format!("{id}.json")),
            &stage.path().join("profile.json"),
        ),
    ])?;
    files::publish(id, stage, existing.is_some())?;
    auto_backup::notify_central_change();
    read_at(&library(), id)
}

pub fn create(title: &str, content: &str) -> Result<HostsProfile, String> {
    let _lock = RepoLock::acquire_foreground("create Hosts profile").map_err(|e| e.to_string())?;
    storage::recover()?;
    files::recover()?;
    migration::run()?;
    user_config::checked(&library())?;
    if list_at(&library())?.len() >= 1000 {
        return Err("HOSTS_PROFILE_LIMIT".into());
    }
    write(&uuid::Uuid::new_v4().to_string(), title, content, None)
}
pub fn update(
    id: &str,
    title: &str,
    content: &str,
    expected: &str,
) -> Result<HostsProfile, String> {
    let _lock = RepoLock::acquire_foreground("save Hosts profile").map_err(|e| e.to_string())?;
    storage::recover()?;
    files::recover()?;
    migration::run()?;
    user_config::checked(&library())?;
    let before = read_at(&library(), id)?;
    if before.revision != expected {
        return Err("HOSTS_PROFILE_CONFLICT".into());
    }
    write(id, title, content, Some(&before))
}
pub fn delete(id: &str, expected: &str) -> Result<(), String> {
    let _lock = RepoLock::acquire_foreground("delete Hosts profile").map_err(|e| e.to_string())?;
    storage::recover()?;
    files::recover()?;
    migration::run()?;
    user_config::checked(&library())?;
    let before = read_at(&library(), id)?;
    if before.revision != expected {
        return Err("HOSTS_PROFILE_CONFLICT".into());
    }
    files::delete(id)?;
    auto_backup::notify_central_change();
    Ok(())
}
pub fn apply(
    id: &str,
    expected_profile: &str,
    expected_system: &str,
) -> Result<HostsSaved, String> {
    let _lock = RepoLock::acquire_foreground("apply Hosts profile").map_err(|e| e.to_string())?;
    storage::recover()?;
    files::recover()?;
    migration::run()?;
    user_config::checked(&library())?;
    let profile = read_at(&library(), id)?;
    if profile.revision != expected_profile {
        return Err("HOSTS_PROFILE_CONFLICT".into());
    }
    super::save_unlocked(&profile.content, expected_system, Some(id))
}

/// Complete interrupted profile writes before backup projection. Caller holds RepoLock.
pub(crate) fn recover_pending() -> Result<(), String> {
    storage::recover()?;
    files::recover()?;
    migration::run()
}
