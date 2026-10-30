use super::definition::{valid_id, AutomationDraft, ManagedAutomation};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
const MAX_REGISTRY_BYTES: usize = 16 * 1024 * 1024;

#[derive(Default, Serialize, Deserialize)]
pub(super) struct Registry {
    pub version: u32,
    pub tasks: Vec<ManagedAutomation>,
    #[serde(default)]
    pub backup_initialized: bool,
    #[serde(default)]
    pub pending_backup: BTreeMap<String, Option<AutomationDraft>>,
    #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
    pub removal_pending: BTreeSet<String>,
    #[serde(skip)]
    pub issues: Vec<String>,
}

pub(super) fn root() -> PathBuf {
    #[cfg(test)]
    {
        super::super::central_repo::base_dir().join("automation-test-state")
    }
    #[cfg(not(test))]
    {
        std::env::var_os("AGENT_HUB_AUTOMATION_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                dirs::data_local_dir()
                    .map(|path| path.join("com.jtstudio.agenthub/automations"))
                    .unwrap_or_default()
            })
    }
}

pub(super) fn load(root: &Path) -> Result<Vec<ManagedAutomation>, String> {
    Ok(read_registry(root)?.tasks)
}

pub(super) fn read_registry(root: &Path) -> Result<Registry, String> {
    if root.join("task.json").is_file() {
        return Ok(Registry {
            version: 1,
            tasks: vec![super::package::read(root)?],
            ..Default::default()
        });
    }
    let (packages, mut issues) = super::package::discover(root);
    let mut registry = match read_legacy(root) {
        Ok(registry) => registry,
        Err(error) if !packages.is_empty() => {
            issues.push(format!("Legacy creation records are damaged: {error}"));
            Registry {
                version: 1,
                ..Default::default()
            }
        }
        Err(error) => return Err(error),
    };
    if !root.join("tasks.json").exists() && !packages.is_empty() {
        registry.backup_initialized = true;
    }
    for record in packages {
        if registry.tasks.iter().any(|r| r.id == record.id) {
            issues.push(format!(
                "Task instance conflicts with legacy record: {}",
                record.id
            ));
            continue;
        }
        let receipt = match super::package::receipt(&record) {
            Ok(receipt) => receipt,
            Err(error) => {
                issues.push(format!("{}: {error}", record.draft.name));
                continue;
            }
        };
        if receipt.pending_backup || record.revision != receipt.revision {
            registry
                .pending_backup
                .insert(record.id.clone(), Some(record.draft.clone()));
        }
        if receipt.removal_pending {
            registry.removal_pending.insert(record.id.clone());
        }
        registry.tasks.push(record);
    }
    if let Ok(entries) = std::fs::read_dir(root.join("deletions")) {
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let Some(id) = entry
                .file_name()
                .to_str()
                .and_then(|s| s.strip_suffix(".json"))
                .map(|s| format!("agent_hub:{s}"))
            else {
                continue;
            };
            if valid_id(&id) && !registry.tasks.iter().any(|r| r.id == id) {
                registry.pending_backup.insert(id, None);
            }
        }
    }
    registry.issues.extend(issues);
    Ok(registry)
}

fn read_legacy(root: &Path) -> Result<Registry, String> {
    if !root.is_absolute() {
        return Err("Cannot resolve an absolute automation data directory; set AGENT_HUB_AUTOMATION_HOME to an absolute path".into());
    }
    let path = root.join("tasks.json");
    use std::io::Read;
    let file = match File::open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Registry {
                version: 1,
                ..Default::default()
            })
        }
        Err(e) => return Err(e.to_string()),
    };
    let mut bytes = Vec::new();
    file.take((MAX_REGISTRY_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > MAX_REGISTRY_BYTES {
        return Err("Automation registry exceeds 16 MiB".into());
    }
    let registry: Registry = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    if registry.version != 1 {
        return Err("Unsupported automation registry version".into());
    }
    let mut ids = std::collections::HashSet::new();
    for task in &registry.tasks {
        if !valid_id(&task.id) || !ids.insert(&task.id) {
            return Err("Invalid or duplicate managed automation ID".into());
        }
    }
    if registry.removal_pending.iter().any(|id| !ids.contains(id)) {
        return Err("Pending removal has no managed task record".into());
    }
    Ok(registry)
}

pub(super) fn legacy_task(root: &Path, id: &str) -> Result<Option<ManagedAutomation>, String> {
    Ok(read_legacy(root)?
        .tasks
        .into_iter()
        .find(|task| task.id == id))
}

pub(super) fn retire_legacy(root: &Path, id: &str) -> Result<(), String> {
    let _lock = Lock::acquire(root)?;
    let mut registry = read_legacy(root)?;
    registry.tasks.retain(|record| record.id != id);
    registry.pending_backup.remove(id);
    registry.removal_pending.remove(id);
    write(
        &root.join("tasks.json"),
        &serde_json::to_vec_pretty(&registry).map_err(|e| e.to_string())?,
    )
}

pub(super) fn restore_legacy(root: &Path, record: &ManagedAutomation) -> Result<(), String> {
    let _lock = Lock::acquire(root)?;
    let mut registry = read_legacy(root)?;
    registry.tasks.retain(|old| old.id != record.id);
    registry.tasks.push(record.clone());
    write(
        &root.join("tasks.json"),
        &serde_json::to_vec_pretty(&registry).map_err(|e| e.to_string())?,
    )
}

pub(super) fn save(root: &Path, tasks: Vec<ManagedAutomation>) -> Result<(), String> {
    let mut registry = read_registry(root)?;
    for task in &tasks {
        if !registry.backup_initialized
            || registry
                .tasks
                .iter()
                .find(|old| old.id == task.id)
                .map(|old| &old.draft)
                != Some(&task.draft)
        {
            registry
                .pending_backup
                .insert(task.id.clone(), Some(task.draft.clone()));
        }
    }
    for old in &registry.tasks {
        if !tasks.iter().any(|task| task.id == old.id) {
            registry.pending_backup.insert(old.id.clone(), None);
        }
    }
    registry.tasks = tasks;
    registry
        .removal_pending
        .retain(|id| registry.tasks.iter().any(|task| &task.id == id));
    registry.backup_initialized = true;
    write_registry(root, &registry)?;
    #[cfg(not(test))]
    super::super::auto_backup::notify_central_change();
    Ok(())
}

pub(super) fn write_registry(root: &Path, registry: &Registry) -> Result<(), String> {
    // Keep the released storage format for old tasks. New definitions remain
    // authoritative in their own packages, even when tasks.json is missing.
    let mut legacy = read_legacy(root)?;
    legacy.tasks.clear();
    legacy.pending_backup.clear();
    legacy.removal_pending.clear();
    legacy.backup_initialized = registry.backup_initialized;
    for record in &registry.tasks {
        if super::package::directory(record).is_some() {
            let _lock = super::package::lock(root, &record.id)?;
            super::package::checked(root, record)?;
            let current = super::package::read(
                &super::package::directory(record).ok_or("Missing task package")?,
            )?;
            if current.revision != record.revision || current.draft != record.draft {
                return Err("Task package changed during metadata update; retry".into());
            }
            let mut receipt = super::package::receipt(record)?;
            receipt.revision = record.revision;
            receipt.fingerprint = super::package::storage_fingerprint(&record.draft)?;
            receipt.pending_backup = registry.pending_backup.contains_key(&record.id);
            super::package::write_receipt(record, &receipt)?;
        } else {
            legacy.tasks.push(record.clone());
            if registry.removal_pending.contains(&record.id) {
                legacy.removal_pending.insert(record.id.clone());
            }
        }
    }
    for (id, draft) in &registry.pending_backup {
        if !registry
            .tasks
            .iter()
            .any(|r| r.id == *id && super::package::directory(r).is_some())
        {
            legacy.pending_backup.insert(id.clone(), draft.clone());
        }
    }
    let data = serde_json::to_vec_pretty(&legacy).map_err(|e| e.to_string())?;
    if data.len() > MAX_REGISTRY_BYTES {
        return Err("Automation registry exceeds 16 MiB; existing tasks were preserved".into());
    }
    if !legacy.tasks.is_empty()
        || !legacy.pending_backup.is_empty()
        || root.join("tasks.json").exists()
    {
        write(&root.join("tasks.json"), &data)?;
    }
    if let Ok(entries) = std::fs::read_dir(root.join("deletions")) {
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            if let Some(id) = entry
                .file_name()
                .to_str()
                .and_then(|s| s.strip_suffix(".json"))
                .map(|s| format!("agent_hub:{s}"))
            {
                if valid_id(&id) && !registry.pending_backup.contains_key(&id) {
                    std::fs::remove_file(entry.path()).map_err(|e| e.to_string())?;
                }
            }
        }
    }
    Ok(())
}

/// Atomic replacement preserves the old definition if writing fails.
pub(super) fn write(path: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Missing parent directory")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temp.write_all(contents)
        .and_then(|()| temp.as_file().sync_all())
        .map_err(|e| e.to_string())?;
    temp.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}

pub(super) struct Lock(File);
impl Lock {
    pub fn acquire(root: &Path) -> Result<Self, String> {
        if !root.is_absolute() {
            return Err("Cannot resolve an absolute automation data directory; set AGENT_HUB_AUTOMATION_HOME to an absolute path".into());
        }
        std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(root.join(".lock"))
            .map_err(|e| e.to_string())?;
        file.try_lock_exclusive()
            .map_err(|_| "Another automation operation is running; retry shortly".to_string())?;
        Ok(Self(file))
    }
}
impl Drop for Lock {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn concurrent_writers_are_refused_and_corruption_is_not_overwritten() {
        let temporary = tempfile::tempdir().unwrap();
        let first = Lock::acquire(temporary.path()).unwrap();
        assert!(Lock::acquire(temporary.path()).is_err());
        drop(first);
        assert!(Lock::acquire(temporary.path()).is_ok());
        write(&temporary.path().join("tasks.json"), b"invalid").unwrap();
        assert!(load(temporary.path()).is_err());
    }
}
