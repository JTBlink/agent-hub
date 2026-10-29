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
    let data = serde_json::to_vec_pretty(registry).map_err(|e| e.to_string())?;
    if data.len() > MAX_REGISTRY_BYTES {
        return Err("Automation registry exceeds 16 MiB; existing tasks were preserved".into());
    }
    write(&root.join("tasks.json"), &data)
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
