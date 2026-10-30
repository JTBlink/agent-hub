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
    let previous = read(target)?;
    let mut changed = false;
    for (name, record) in &records {
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
mod tests {
    use super::*;
    #[test]
    fn automatic_git_backup_pushes_task_changes_and_restores_only_dormant_definitions() {
        use crate::core::{auto_backup, backup_workspace, central_repo, skill_store::SkillStore};
        let _lock = central_repo::test_base_dir_lock();
        let temporary = tempfile::tempdir().unwrap();
        central_repo::set_test_base_dir_override(Some(temporary.path().join("app")));
        struct Reset;
        impl Drop for Reset {
            fn drop(&mut self) {
                central_repo::set_test_base_dir_override(None);
            }
        }
        let _reset = Reset;
        std::fs::create_dir_all(central_repo::base_dir()).unwrap();
        let db = SkillStore::new(&central_repo::db_path()).unwrap();
        backup_workspace::initialize(&db).unwrap();
        let remote_path = temporary.path().join("remote.git");
        let remote = git2::Repository::init_bare(&remote_path).unwrap();
        let repository = git2::Repository::open(backup_workspace::repo_dir()).unwrap();
        repository
            .remote("origin", remote_path.to_str().unwrap())
            .unwrap();
        let runtime = store::root();
        std::fs::create_dir_all(&runtime).unwrap();
        let id = format!("agent_hub:{}", uuid::Uuid::new_v4());
        let mut record = super::super::ManagedAutomation {
            id: id.clone(),
            revision: 1,
            draft: AutomationDraft {
                package_options: None,
                files: vec![super::super::AutomationScriptFile {
                    path: "bundle/main.py".into(),
                    content: "print('original')".into(),
                }],
                name: "Audit".into(),
                provider: super::super::Provider::System,
                content: "printf original".into(),
                script_dir: None,
                workdir: None,
                schedule: super::super::Schedule::Manual,
                enabled: false,
            },
            source: "launchd".into(),
            identifier: "local-only".into(),
            location: "<runtime>".into(),
        };
        let workspace = temporary.path().join("workspace");
        std::fs::create_dir(&workspace).unwrap();
        record.draft.workdir = Some(workspace.to_string_lossy().into_owned());
        record.source = super::super::native::source().into();
        let (identifier, location) = super::super::native::paths(&runtime, &record).unwrap();
        record.identifier = identifier;
        record.location = location.to_string_lossy().into_owned();
        store::save(&runtime, vec![record.clone()]).unwrap();
        let script = super::super::native::payload::write(
            &super::super::native::directory(&runtime, &record),
            &record.draft,
            &record.id,
            true,
        )
        .unwrap();
        std::fs::write(runtime.join("output.log"), "private runtime output").unwrap();
        let history = runtime
            .join(id.trim_start_matches("agent_hub:"))
            .join("runs/20261027T010000Z-123");
        std::fs::create_dir_all(&history).unwrap();
        std::fs::write(history.join("output.log"), "private run content").unwrap();
        std::fs::write(history.join("exit"), "0").unwrap();
        assert_eq!(
            auto_backup::run_round_blocking(&db),
            auto_backup::Outcome::BackedUp
        );
        let branch = repository.head().unwrap().shorthand().unwrap().to_string();
        let tree = remote
            .find_reference(&format!("refs/heads/{branch}"))
            .unwrap()
            .peel_to_tree()
            .unwrap();
        let path = format!(".agent-hub/{}", filename(&id).unwrap());
        assert!(tree.get_path(Path::new(&path)).is_ok());
        assert!(tree.get_path(Path::new("output.log")).is_err());
        assert!(tree.get_path(Path::new("tasks.json")).is_err());
        assert!(tree.get_path(Path::new("runs")).is_err());
        assert!(tree
            .get_path(Path::new(id.trim_start_matches("agent_hub:")))
            .is_err());
        assert!(
            !needs_export(),
            "runtime evidence does not enqueue definition backups"
        );
        let tag = backup_workspace::commit(&db, "task snapshot").unwrap();
        std::fs::write(&script, "printf changed").unwrap();
        std::fs::write(
            workspace.join("bundle/main.py"),
            "print('customized script')",
        )
        .unwrap();
        super::super::script_sync::sync_at(&runtime).unwrap();
        assert_eq!(
            auto_backup::run_round_blocking(&db),
            auto_backup::Outcome::BackedUp
        );
        let updated_tree = remote
            .find_reference(&format!("refs/heads/{branch}"))
            .unwrap()
            .peel_to_tree()
            .unwrap();
        let blob = remote
            .find_blob(updated_tree.get_path(Path::new(&path)).unwrap().id())
            .unwrap();
        let saved: AutomationBackup = serde_json::from_slice(blob.content()).unwrap();
        assert_eq!(saved.draft.content, "printf changed");
        assert_eq!(saved.draft.files[0].content, "print('customized script')");
        assert_eq!(std::fs::read_to_string(&script).unwrap(), "printf changed");
        backup_workspace::restore(&db, &tag).unwrap();
        assert_eq!(list().unwrap()[0].draft.content, "printf original");
        assert_eq!(
            store::load(&runtime).unwrap()[0].draft.content,
            "printf changed",
            "restoring Git must not edit local schedulers"
        );
        flush(&super::super::super::sync_metadata::metadata_dir()).unwrap();
        assert_eq!(
            list().unwrap()[0].draft.content,
            "printf original",
            "a later projection must retain the restored definition"
        );
        store::save(&runtime, vec![]).unwrap();
        assert_eq!(
            auto_backup::run_round_blocking(&db),
            auto_backup::Outcome::BackedUp
        );
        let tree = remote
            .find_reference(&format!("refs/heads/{branch}"))
            .unwrap()
            .peel_to_tree()
            .unwrap();
        assert!(tree.get_path(Path::new(&path)).is_err());
    }
    #[test]
    fn exports_only_definitions_and_keeps_remote_changes_until_a_local_edit() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("runtime");
        let meta = temp.path().join("metadata");
        std::fs::create_dir(&root).unwrap();
        let id = format!("agent_hub:{}", uuid::Uuid::new_v4());
        let draft = AutomationDraft {
            package_options: None,
            files: Vec::new(),
            name: "Audit".into(),
            provider: super::super::Provider::System,
            content: "printf test".into(),
            script_dir: None,
            workdir: None,
            schedule: super::super::Schedule::Manual,
            enabled: true,
        };
        let record = super::super::ManagedAutomation {
            id: id.clone(),
            revision: 1,
            draft: draft.clone(),
            source: "launchd".into(),
            identifier: "local-only-id".into(),
            location: "<local-runtime>".into(),
        };
        store::save(&root, vec![record.clone()]).unwrap();
        flush_from(&root, &meta).unwrap();
        let path = meta.join(filename(&id).unwrap());
        let exported = std::fs::read_to_string(&path).unwrap();
        assert!(!exported.contains("local-only-id") && !exported.contains("<local-runtime>"));
        let mut remote = portable(&id, draft);
        remote.draft.name = "Remote edit".into();
        store::write(&path, &serde_json::to_vec(&remote).unwrap()).unwrap();
        flush_from(&root, &meta).unwrap();
        assert_eq!(
            read(&meta).unwrap().values().next().unwrap().draft.name,
            "Remote edit"
        );
        let mut edited = record;
        edited.draft.name = "Local edit".into();
        store::save(&root, vec![edited]).unwrap();
        flush_from(&root, &meta).unwrap();
        assert_eq!(
            read(&meta).unwrap().values().next().unwrap().draft.name,
            "Local edit"
        );
        store::save(&root, vec![]).unwrap();
        flush_from(&root, &meta).unwrap();
        assert!(!path.exists());
    }
    #[test]
    fn importing_definitions_does_not_create_scheduler_registrations_or_runtime_state() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source");
        let target = temp.path().join("target");
        let id = format!("agent_hub:{}", uuid::Uuid::new_v4());
        let draft = AutomationDraft {
            package_options: None,
            files: Vec::new(),
            name: "Audit".into(),
            provider: super::super::Provider::System,
            content: "exit 99".into(),
            script_dir: None,
            workdir: None,
            schedule: super::super::Schedule::Manual,
            enabled: true,
        };
        store::write(
            &source.join(filename(&id).unwrap()),
            &serde_json::to_vec(&portable(&id, draft)).unwrap(),
        )
        .unwrap();
        assert!(project(&source, &target).unwrap());
        assert!(!project(&source, &target).unwrap());
        assert_eq!(std::fs::read_dir(&target).unwrap().count(), 1);
        std::fs::write(source.join("automation-invalid.json"), "{}").unwrap();
        assert!(project(&source, &target).is_err());
    }
}
