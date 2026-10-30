//! Publish portable task directories next to skills; retain legacy JSON readers.
use super::*;
use crate::core::automation::package;
use std::fs;

/// Stage every package before replacing the managed automation subtree.
pub(crate) fn export(metadata: &Path, repository: &Path) -> Result<(), String> {
    let records = read(metadata)?;
    let stage = tempfile::tempdir_in(repository).map_err(|e| e.to_string())?;
    let content = stage.path().join("automations");
    fs::create_dir(&content).map_err(|e| e.to_string())?;
    for record in records.values() {
        // Include identity so same-name tasks remain separate and names cannot collide.
        let name = crate::core::path_guard::sanitize_name(&record.draft.name);
        let name = format!("{name}--{}", record.id.trim_start_matches("agent_hub:"));
        package::write_backup_directory(record, &content.join(name))?;
    }
    let target = repository.join("automations");
    if target.is_symlink() {
        return Err("Linked automation backup directory is not supported".into());
    }
    let previous = stage.path().join("previous");
    let existed = target.exists();
    if existed {
        fs::rename(&target, &previous).map_err(|e| e.to_string())?;
    }
    if let Err(error) = fs::rename(content, &target) {
        if existed {
            fs::rename(previous, target).map_err(|e| format!("{error}; restoration: {e}"))?;
        }
        return Err(error.to_string());
    }
    // New writes have one public representation; old flat files remain readable.
    for name in read(&repository.join(".agent-hub"))?.keys() {
        fs::remove_file(repository.join(".agent-hub").join(name)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Import only definitions into the local metadata namespace, never install tasks.
pub(crate) fn import(repository: &Path, metadata: &Path) -> Result<bool, String> {
    let mut records = read(&repository.join(".agent-hub"))?;
    let root = repository.join("automations");
    let present = match root.symlink_metadata() {
        Ok(_) => true,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => return Err(error.to_string()),
    };
    if present {
        if root.is_symlink() || !root.is_dir() {
            return Err("Invalid automation backup directory".into());
        }
        let mut ids = std::collections::BTreeSet::new();
        for (index, entry) in walkdir::WalkDir::new(&root)
            .max_depth(6)
            .follow_links(false)
            .into_iter()
            .enumerate()
        {
            if index >= 8192 {
                return Err("Automation backup is too large".into());
            }
            let entry = entry.map_err(|e| e.to_string())?;
            if crate::core::path_guard::is_link_or_reparse_point(
                &entry.metadata().map_err(|e| e.to_string())?,
            ) {
                return Err("Automation backups cannot contain links".into());
            }
            if !entry.file_type().is_file() || entry.file_name() != "task.json" {
                continue;
            }
            let record = package::read_backup_directory(
                entry.path().parent().ok_or("Missing task directory")?,
            )?;
            if !ids.insert(record.id.clone()) {
                return Err("Duplicate automation backup identity".into());
            }
            records.insert(filename(&record.id)?, record);
        }
    }
    project_records(&records, metadata)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::automation::{AutomationScriptFile, Provider, Schedule};
    fn record() -> AutomationBackup {
        AutomationBackup {
            schema_version: 1,
            id: format!("agent_hub:{}", uuid::Uuid::new_v4()),
            shell: shell().into(),
            draft: AutomationDraft {
                package_options: None,
                name: "Example task".into(),
                provider: Provider::System,
                content: "echo example".into(),
                workdir: None,
                script_dir: None,
                files: vec![AutomationScriptFile {
                    path: "prompt.md".into(),
                    content: "Review the project".into(),
                }],
                enabled: true,
                schedule: Schedule::Hourly { minute: 15 },
            },
        }
    }
    #[test]
    fn publishes_real_task_directories_and_imports_without_local_runtime() {
        let temp = tempfile::tempdir().unwrap();
        let meta = temp.path().join("metadata");
        let repo = temp.path().join("repository");
        fs::create_dir(&repo).unwrap();
        let one = record();
        let mut two = one.clone();
        two.id = format!("agent_hub:{}", uuid::Uuid::new_v4());
        for task in [&one, &two] {
            store::write(
                &meta.join(filename(&task.id).unwrap()),
                &serde_json::to_vec(task).unwrap(),
            )
            .unwrap();
        }
        export(&meta, &repo).unwrap();
        let tasks: Vec<_> = fs::read_dir(repo.join("automations"))
            .unwrap()
            .map(|e| e.unwrap().path())
            .collect();
        assert_eq!(tasks.len(), 2);
        for task in &tasks {
            assert!(!task.join(".local").exists());
            let package = package::preview_package(task).unwrap();
            assert!(!package.draft.enabled);
            assert!(package.draft.workdir.is_none());
            assert!(task.join("prompt.md").is_file());
            assert!(task.join("scripts").is_dir());
        }
        let target = temp.path().join("restored");
        import(&repo, &target).unwrap();
        assert_eq!(read(&target).unwrap().len(), 2);
        assert!(read(&target).unwrap().values().all(|r| !r.draft.enabled));
        assert!(!target.join("tasks.json").exists());
        store::write(
            &meta.join(filename(&one.id).unwrap()),
            &serde_json::to_vec(&AutomationBackup {
                draft: AutomationDraft {
                    name: "Renamed".into(),
                    ..one.draft.clone()
                },
                ..one.clone()
            })
            .unwrap(),
        )
        .unwrap();
        fs::remove_file(meta.join(filename(&two.id).unwrap())).unwrap();
        export(&meta, &repo).unwrap();
        import(&repo, &target).unwrap();
        assert_eq!(read(&target).unwrap().len(), 1);
        assert_eq!(
            read(&target).unwrap().values().next().unwrap().draft.name,
            "Renamed"
        );
    }
    #[test]
    fn accepts_old_backups_and_migrates_only_the_repository_representation() {
        let temp = tempfile::tempdir().unwrap();
        let repo = temp.path().join("repo");
        let old = repo.join(".agent-hub");
        let task = record();
        store::write(
            &old.join(filename(&task.id).unwrap()),
            &serde_json::to_vec(&task).unwrap(),
        )
        .unwrap();
        let local = temp.path().join("local");
        import(&repo, &local).unwrap();
        assert_eq!(
            read(&local).unwrap().values().next().unwrap().draft,
            task.draft
        );
        export(&local, &repo).unwrap();
        assert!(read(&old).unwrap().is_empty());
        assert_eq!(fs::read_dir(repo.join("automations")).unwrap().count(), 1);
        import(&repo, &local).unwrap();
        assert_eq!(read(&local).unwrap().values().next().unwrap().id, task.id);
    }
    #[cfg(unix)]
    #[test]
    fn rejects_links_and_damaged_backups_before_replacing_local_definitions() {
        let temp = tempfile::tempdir().unwrap();
        let repo = temp.path().join("repo");
        fs::create_dir(&repo).unwrap();
        let meta = temp.path().join("meta");
        let task = record();
        store::write(
            &meta.join(filename(&task.id).unwrap()),
            &serde_json::to_vec(&task).unwrap(),
        )
        .unwrap();
        export(&meta, &repo).unwrap();
        let directory = fs::read_dir(repo.join("automations"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        fs::remove_file(directory.join("prompt.md")).unwrap();
        std::os::unix::fs::symlink(temp.path().join("outside"), directory.join("prompt.md"))
            .unwrap();
        let before = fs::read(meta.join(filename(&task.id).unwrap())).unwrap();
        assert!(import(&repo, &meta).is_err());
        assert_eq!(
            fs::read(meta.join(filename(&task.id).unwrap())).unwrap(),
            before
        );
    }
}
