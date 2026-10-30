//! Explicit directory normalization. Uninstall first so no scheduler or venv
//! continues to reference a moved package; identity and history remain intact.
use super::*;
use std::fs;

#[derive(Serialize, Deserialize)]
struct Journal {
    id: String,
    from: PathBuf,
    to: PathBuf,
    receipt: Receipt,
    binding: Binding,
}

fn journal_path(state: &Path, id: &str) -> PathBuf {
    state
        .join("directory-migrations")
        .join(format!("{}.json", id.trim_start_matches("agent_hub:")))
}

fn verify_identity(path: &Path, id: &str) -> Result<(), String> {
    super::storage::regular_directory(path)?;
    super::storage::regular_directory(&path.join(".local"))?;
    let manifest: Manifest = super::storage::json(&path.join("task.json"))?;
    if manifest.instance_id != id {
        return Err("Directory migration identity changed; files were preserved".into());
    }
    Ok(())
}

fn verify_idle(path: &Path) -> Result<(), String> {
    let receipt: Receipt = super::storage::json(&path.join(".local/receipt.json"))?;
    if receipt.state != "uninstalled" || receipt.removal_pending || receipt.archived {
        return Err("Uninstall this task before migrating its directory; content and history will be retained".into());
    }
    for name in ["run.claim", "ready", "env"] {
        match path.join(".local").join(name).symlink_metadata() {
            Ok(_) => {
                return Err(
                    "Task runtime remains; finish uninstallation before directory migration".into(),
                )
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}

fn restore(state: &Path, journal: &Journal) -> Result<(), String> {
    let root = root(state);
    super::storage::regular_directory(&root)?;
    if !valid_id(&journal.id)
        || journal.receipt.state != "uninstalled"
        || journal.from == journal.to
        || [&journal.from, &journal.to]
            .iter()
            .any(|path| path.parent() != Some(root.as_path()))
    {
        return Err("Invalid task directory migration journal".into());
    }
    for path in [&journal.from, &journal.to] {
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or("Invalid migration directory name")?;
        crate::core::path_guard::ensure_safe_skill_relative_path(name)
            .map_err(|error| error.to_string())?;
    }
    if !journal.from.exists() {
        verify_identity(&journal.to, &journal.id)?;
        verify_idle(&journal.to)?;
        fs::rename(&journal.to, &journal.from).map_err(|e| e.to_string())?;
    } else if journal.to.exists() {
        // Only an empty allocation may be discarded; never overwrite a second package.
        super::storage::regular_directory(&journal.to)?;
        fs::remove_dir(&journal.to)
            .map_err(|e| format!("Migration target is not empty; files were preserved: {e}"))?;
    }
    verify_identity(&journal.from, &journal.id)?;
    verify_idle(&journal.from)?;
    json_write(&journal.from.join(".local/binding.json"), &journal.binding)?;
    json_write(&journal.from.join(".local/receipt.json"), &journal.receipt)?;
    fs::remove_file(journal_path(state, &journal.id)).map_err(|e| e.to_string())
}

pub(super) fn migrate(state: &Path, id: &str) -> Result<String, String> {
    let journal_file = journal_path(state, id);
    if journal_file.exists() {
        let previous: Journal = super::storage::json(&journal_file)?;
        if previous.id != id {
            return Err("Directory migration journal does not match this task".into());
        }
        restore(state, &previous)?;
    }
    let record = find(state, id)?;
    let path = checked(state, &record)?;
    let current = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Invalid task directory name")?;
    // Existing ASCII paths remain stable when a display name is edited.
    if current.is_ascii() {
        return Ok(id.into());
    }
    let old_receipt = receipt(&record)?;
    verify_idle(&path)?;
    if store::read_registry(state)?.tasks.iter().any(|other| {
        other.id != id
            && [&other.draft.script_dir, &other.draft.workdir]
                .into_iter()
                .flatten()
                .any(|value| Path::new(value).starts_with(&path))
    }) {
        return Err(
            "Another task references this directory; update that binding before migration".into(),
        );
    }
    let revision = old_receipt
        .revision
        .max(record.revision)
        .checked_add(1)
        .ok_or("Automation revision exhausted")?;
    let target = super::super::workspace::allocate(&root(state), &record.draft.name)?;
    let journal = Journal {
        id: id.into(),
        from: path.clone(),
        to: target.clone(),
        receipt: old_receipt.clone(),
        binding: Binding {
            workdir: record.draft.workdir.clone(),
        },
    };
    if let Err(error) = json_write(&journal_file, &journal) {
        let _ = fs::remove_dir(&target);
        return Err(error);
    }
    let result = (|| {
        // Unix can atomically replace the reserved empty directory; Windows refuses it.
        #[cfg(windows)]
        fs::remove_dir(&target).map_err(|e| e.to_string())?;
        fs::rename(&path, &target).map_err(|e| e.to_string())?;
        let mut next = record.clone();
        next.draft.script_dir = Some(target.to_string_lossy().into_owned());
        if let Some(workdir) = &next.draft.workdir {
            if let Ok(relative) = Path::new(workdir).strip_prefix(&path) {
                next.draft.workdir = Some(target.join(relative).to_string_lossy().into_owned());
            }
        }
        json_write(
            &target.join(".local/binding.json"),
            &Binding {
                workdir: next.draft.workdir.clone(),
            },
        )?;
        let mut receipt = old_receipt;
        receipt.revision = revision;
        receipt.fingerprint = super::storage::fingerprint(&next.draft)?;
        receipt.pending_backup = true;
        receipt.error = None;
        write_receipt(&next, &receipt)?;
        fs::remove_file(&journal_file).map_err(|e| e.to_string())?;
        Ok::<_, String>(())
    })();
    if let Err(error) = result {
        let restoration = restore(state, &journal);
        return Err(format!(
            "Directory migration failed: {error}; restoration: {restoration:?}"
        ));
    }
    super::lifecycle::notify();
    Ok(id.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn legacy(state: &Path) -> ManagedAutomation {
        let draft: AutomationDraft = serde_json::from_value(serde_json::json!({
            "name":"MR 处理", "provider":"system", "content":"printf keep", "workdir":null,
            "schedule":{"kind":"hourly","minute":30}, "enabled":false,
            "package_options":{"version":"1.2.3","dependencies":[],"hermes":null}
        }))
        .unwrap();
        let id = super::super::lifecycle::create(state, draft, vec![], false).unwrap();
        let record = find(state, &id).unwrap();
        fs::rename(directory(&record).unwrap(), root(state).join("MR 处理")).unwrap();
        find(state, &id).unwrap()
    }
    #[test]
    fn migrates_chinese_directory_without_changing_identity_schedule_content_or_history() {
        let temp = tempfile::tempdir().unwrap();
        let state = temp.path();
        let old = legacy(state);
        let old_path = directory(&old).unwrap();
        store::write(&old_path.join(".local/runs/saved.log"), b"retained output").unwrap();
        let mut binding = old.draft.clone();
        binding.workdir = Some(old_path.join("project").to_string_lossy().into_owned());
        json_write(
            &old_path.join(".local/binding.json"),
            &Binding {
                workdir: binding.workdir,
            },
        )
        .unwrap();
        let old = find(state, &old.id).unwrap();
        migrate(state, &old.id).unwrap();
        let next = find(state, &old.id).unwrap();
        let target = directory(&next).unwrap();
        assert_eq!(target.file_name().unwrap(), "agent-mr-processing");
        assert!(!old_path.exists());
        assert_eq!(next.id, old.id);
        assert_eq!(next.revision, old.revision + 1);
        assert_eq!(next.draft.name, old.draft.name);
        assert_eq!(next.draft.schedule, old.draft.schedule);
        assert_eq!(next.draft.content, old.draft.content);
        assert_eq!(next.draft.files, old.draft.files);
        assert_eq!(next.draft.package_options, old.draft.package_options);
        assert_eq!(
            next.draft.workdir.as_deref(),
            target.join("project").to_str()
        );
        assert_eq!(
            fs::read(target.join(".local/runs/saved.log")).unwrap(),
            b"retained output"
        );
        assert_eq!(receipt(&next).unwrap().state, "uninstalled");
        assert!(receipt(&next).unwrap().pending_backup);
        assert!(!journal_path(state, &old.id).exists());
        migrate(state, &old.id).unwrap();
        assert_eq!(find(state, &old.id).unwrap().revision, next.revision);
    }
    #[test]
    fn refuses_installed_running_and_unowned_environments_without_moving_data() {
        let temp = tempfile::tempdir().unwrap();
        let old = legacy(temp.path());
        let path = directory(&old).unwrap();
        let mut installed = receipt(&old).unwrap();
        installed.state = "installed".into();
        write_receipt(&old, &installed).unwrap();
        assert!(migrate(temp.path(), &old.id).is_err());
        installed.state = "uninstalled".into();
        write_receipt(&old, &installed).unwrap();
        for name in ["run.claim", "ready", "env"] {
            fs::create_dir(path.join(".local").join(name)).unwrap();
            assert!(migrate(temp.path(), &old.id).is_err());
            assert!(path.join("task.json").is_file());
            fs::remove_dir(path.join(".local").join(name)).unwrap();
        }
    }
    #[test]
    fn another_tasks_project_binding_blocks_migration_and_occupied_names_are_preserved() {
        let temp = tempfile::tempdir().unwrap();
        let old = legacy(temp.path());
        let path = directory(&old).unwrap();
        let mut shared = old.draft.clone();
        shared.script_dir = None;
        shared.workdir = Some(path.to_string_lossy().into_owned());
        let other = super::super::lifecycle::create(temp.path(), shared, vec![], false).unwrap();
        assert!(migrate(temp.path(), &old.id).is_err());
        let other = find(temp.path(), &other).unwrap();
        let occupied = directory(&other).unwrap();
        store::write(&occupied.join(".local/binding.json"), b"{\"workdir\":null}").unwrap();
        migrate(temp.path(), &old.id).unwrap();
        assert_eq!(
            directory(&find(temp.path(), &old.id).unwrap())
                .unwrap()
                .file_name()
                .unwrap(),
            "agent-mr-processing-2"
        );
        assert!(occupied.join("task.json").is_file());
    }
    #[test]
    fn recovers_an_interrupted_move_before_retrying_and_rejects_foreign_journals() {
        let temp = tempfile::tempdir().unwrap();
        let old = legacy(temp.path());
        let from = directory(&old).unwrap();
        let to =
            super::super::super::workspace::allocate(&root(temp.path()), &old.draft.name).unwrap();
        let journal = Journal {
            id: old.id.clone(),
            from: from.clone(),
            to: to.clone(),
            receipt: receipt(&old).unwrap(),
            binding: Binding { workdir: None },
        };
        json_write(&journal_path(temp.path(), &old.id), &journal).unwrap();
        fs::rename(&from, &to).unwrap();
        migrate(temp.path(), &old.id).unwrap();
        let next = find(temp.path(), &old.id).unwrap();
        assert_eq!(next.revision, 2);
        assert_eq!(directory(&next).unwrap(), to);
        let mut foreign = journal;
        foreign.to = temp.path().join("outside");
        json_write(&journal_path(temp.path(), &old.id), &foreign).unwrap();
        assert!(migrate(temp.path(), &old.id).is_err());
        assert!(directory(&next).unwrap().join("task.json").is_file());
    }
}
