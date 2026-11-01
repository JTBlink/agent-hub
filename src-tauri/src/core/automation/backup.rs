//! Portable definitions share the existing Git metadata namespace. Runtime
//! registrations, wrappers, claims, logs and unrelated workspace files stay local.
//! Customized script contents travel in the portable task definition.
use super::{
    definition::{valid_id, AutomationDraft},
    store, workspace,
};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::Path};

const PREFIX: &str = "automation-";
pub(crate) mod repository;
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AutomationBackup {
    pub schema_version: u32,
    pub id: String,
    pub shell: String,
    pub draft: AutomationDraft,
}

pub fn shell() -> &'static str {
    if cfg!(windows) {
        "powershell"
    } else {
        "sh"
    }
}

fn filename(id: &str) -> Result<String, String> {
    if !valid_id(id) {
        return Err("Invalid automation backup ID".into());
    }
    Ok(format!(
        "{PREFIX}{}.json",
        id.trim_start_matches("agent_hub:")
    ))
}

fn portable(id: &str, mut draft: AutomationDraft) -> AutomationBackup {
    if super::package::is_package_draft(&draft) {
        draft.script_dir = None;
        draft.workdir = None;
    }
    if let Some(path) = &draft.script_dir {
        draft.script_dir = if workspace::is_default(path, id) {
            None
        } else {
            Some(portable_path(path))
        };
    }
    if let Some(path) = &draft.workdir {
        draft.workdir = if draft.script_dir.is_none() && workspace::is_default(path, id) {
            None
        } else {
            dirs::home_dir()
                .and_then(|home| {
                    Path::new(path).strip_prefix(home).ok().map(|relative| {
                        format!("~/{}", relative.to_string_lossy().replace('\\', "/"))
                    })
                })
                .or_else(|| Some(path.clone()))
        };
    }
    AutomationBackup {
        schema_version: 1,
        id: id.into(),
        shell: shell().into(),
        draft,
    }
}

fn portable_path(path: &str) -> String {
    dirs::home_dir()
        .and_then(|home| {
            Path::new(path)
                .strip_prefix(home)
                .ok()
                .map(|relative| format!("~/{}", relative.to_string_lossy().replace('\\', "/")))
        })
        .unwrap_or_else(|| path.into())
}

/// RepoLock is held by backup_workspace; acquire the automation lock second.
/// Mutations only enqueue in the registry and never take RepoLock, preventing
/// lock inversion. Clearing pending state happens after every file is durable.
pub(crate) fn flush(metadata: &Path) -> Result<(), String> {
    flush_from(&store::root(), metadata)
}
fn flush_from(root: &Path, metadata: &Path) -> Result<(), String> {
    super::script_sync::sync_at(root)?;
    let snapshot = store::read_registry(root)?;
    if snapshot.tasks.is_empty() && snapshot.pending_backup.is_empty() {
        return Ok(());
    }
    let _lock = store::Lock::acquire(root)?;
    let mut registry = store::read_registry(root)?;
    if !registry.backup_initialized {
        for task in &registry.tasks {
            registry
                .pending_backup
                .insert(task.id.clone(), Some(task.draft.clone()));
        }
        registry.backup_initialized = true;
    }
    if registry.pending_backup.is_empty() {
        return Ok(());
    }
    std::fs::create_dir_all(metadata).map_err(|e| e.to_string())?;
    if metadata.is_symlink() {
        return Err("Automation backup metadata must not be a symbolic link".into());
    }
    for (id, draft) in &registry.pending_backup {
        let path = metadata.join(filename(id)?);
        if let Some(draft) = draft {
            let bytes =
                super::super::sync_metadata::canonical_json_bytes(&portable(id, draft.clone()))
                    .map_err(|e| e.to_string())?;
            write_changed(&path, &bytes)?;
        } else if path.symlink_metadata().is_ok() {
            std::fs::remove_file(path).map_err(|e| e.to_string())?;
        }
    }
    registry.pending_backup.clear();
    store::write_registry(root, &registry)
}

pub(crate) fn needs_export() -> bool {
    store::read_registry(&store::root()).is_ok_and(|registry| {
        !registry.pending_backup.is_empty()
            || (!registry.backup_initialized && !registry.tasks.is_empty())
    })
}

pub fn list() -> Result<Vec<AutomationBackup>, String> {
    Ok(read(&super::super::sync_metadata::metadata_dir())?
        .into_values()
        .collect())
}

fn read(metadata: &Path) -> Result<BTreeMap<String, AutomationBackup>, String> {
    let mut records = BTreeMap::new();
    if metadata.is_symlink() {
        return Err("Automation backup metadata must not be a symbolic link".into());
    }
    let entries = match std::fs::read_dir(metadata) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(records),
        Err(e) => return Err(e.to_string()),
    };
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with(PREFIX) || !name.ends_with(".json") {
            continue;
        }
        if !entry.file_type().map_err(|e| e.to_string())?.is_file()
            || entry.metadata().map_err(|e| e.to_string())?.len() > 128 * 1024
        {
            return Err("Invalid automation backup entry".into());
        }
        let record: AutomationBackup =
            serde_json::from_slice(&std::fs::read(entry.path()).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        if record.schema_version != 1
            || filename(&record.id)? != name
            || !["sh", "powershell"].contains(&record.shell.as_str())
        {
            return Err("Unsupported or mismatched automation backup".into());
        }
        records.insert(name, record);
    }
    Ok(records)
}

/// Projects only the known definition files. Importing merely stores definitions;
/// it never registers, edits, deletes, or runs a local scheduler task.
pub(crate) fn project(source: &Path, target: &Path) -> Result<bool, String> {
    let records = read(source)?;
    project_records(&records, target)
}

fn project_records(
    records: &BTreeMap<String, AutomationBackup>,
    target: &Path,
) -> Result<bool, String> {
    let previous = read(target)?;
    let mut changed = false;
    for (name, record) in records {
        let bytes =
            super::super::sync_metadata::canonical_json_bytes(record).map_err(|e| e.to_string())?;
        changed |= write_changed(&target.join(name), &bytes)?;
    }
    for name in previous.keys().filter(|name| !records.contains_key(*name)) {
        std::fs::remove_file(target.join(name)).map_err(|e| e.to_string())?;
        changed = true;
    }
    Ok(changed)
}

pub(crate) fn differs(source: &Path, target: &Path) -> Result<bool, String> {
    Ok(read(source)? != read(target)?)
}

fn write_changed(path: &Path, bytes: &[u8]) -> Result<bool, String> {
    if std::fs::read(path).is_ok_and(|existing| existing == bytes) {
        return Ok(false);
    }
    store::write(path, bytes)?;
    Ok(true)
}

/// Explicit restore creates an uninstalled copy. This never overwrites a local task.
pub fn restore(id: &str, apply: bool) -> Result<AutomationBackup, String> {
    let mut record = list()?
        .into_iter()
        .find(|record| record.id == id)
        .ok_or("Automation backup not found")?;
    record.draft.enabled = false;
    record.draft.script_dir = None;
    record.draft.workdir = None;
    if apply {
        if record.draft.provider == super::Provider::System && record.shell != shell() {
            return Err(
                "This backup uses another shell; edit its command before creating a local task"
                    .into(),
            );
        }
        record.draft.script_dir = None;
        record.id = super::package::create_uninstalled(record.draft.clone())?;
    }
    Ok(record)
}

#[cfg(test)]
mod tests;
