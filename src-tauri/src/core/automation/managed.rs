use super::{
    definition::{AutomationDraft, ManagedAutomation, Provider, Schedule},
    hermes_manage, native, store, AutomationOverview, AutomationTask, TaskOrigin,
};
use std::path::Path;

fn native_record(
    root: &Path,
    id: String,
    draft: AutomationDraft,
    revision: u64,
) -> Result<ManagedAutomation, String> {
    let mut record = ManagedAutomation {
        id,
        revision,
        draft,
        source: native::source().into(),
        identifier: String::new(),
        location: String::new(),
    };
    let (identifier, location) = native::paths(root, &record)?;
    record.identifier = identifier;
    record.location = location.to_string_lossy().into_owned();
    Ok(record)
}

pub(super) fn verify(root: &Path, record: &ManagedAutomation) -> Result<(), String> {
    if record.draft.provider == Provider::System {
        let expected = native_record(
            root,
            record.id.clone(),
            record.draft.clone(),
            record.revision,
        )?;
        if expected.identifier != record.identifier
            || expected.location != record.location
            || expected.source != record.source
        {
            return Err("Native task scope no longer matches its creation record; restore its original configuration".into());
        }
    }
    Ok(())
}

pub(super) fn merge(report: &mut AutomationOverview, root: &Path) {
    for task in &mut report.tasks {
        if task.source == "hermes" {
            task.definition = Some(hermes_manage::draft(task));
            task.can_edit = task.prompt.is_some();
        }
    }
    let records = match store::load(root) {
        Ok(records) => records,
        Err(error) => {
            for task in &mut report.tasks {
                task.origin = TaskOrigin::Unknown;
            }
            report.issue(
                "agent_hub",
                format!("Cannot read automation creation records: {error}"),
            );
            return;
        }
    };
    for record in records {
        if let Err(error) = verify(root, &record) {
            report.issue("agent_hub", error);
            continue;
        }
        let index = report.tasks.iter().position(|task| {
            task.source == record.source
                && task.identifier.as_deref() == Some(&record.identifier)
                && task.location == record.location
        });
        if record.draft.provider == Provider::Hermes && index.is_none() {
            // A task removed in Hermes is not resurrected from cached metadata.
            continue;
        }
        let mut task = index.map(|i| report.tasks.remove(i)).unwrap_or_else(|| {
            AutomationTask::new(
                record.id.clone(),
                record.draft.name.clone(),
                &record.source,
                record.location.clone(),
            )
        });
        task.id = record.id.clone();
        task.origin = TaskOrigin::AgentHub;
        task.can_edit = true;
        task.can_run = true;
        task.revision = Some(record.revision);
        if record.draft.provider == Provider::System {
            task.name = record.draft.name.clone();
            task.identifier = Some(record.identifier.clone());
            task.schedule = record.draft.schedule.display();
            task.project = record.draft.workdir.clone();
            task.command = Some(record.draft.content.clone());
            task.definition = Some(record.draft.clone());
            if !record.draft.enabled {
                task.status = "paused".into();
                task.next_run = None;
            } else if matches!(record.draft.schedule, Schedule::Manual) {
                task.status = "active".into();
                task.next_run = None;
            }
            runtime(&mut task, &native::directory(root, &record));
            match native::state(&record) {
                Some(true) => task.status = "running".into(),
                None if record.draft.enabled => task.status = "unknown".into(),
                _ => {}
            }
        }
        report.tasks.push(task);
    }
}

fn runtime(task: &mut AutomationTask, directory: &Path) {
    task.last_run = std::fs::read_to_string(directory.join("started"))
        .ok()
        .map(|s| s.trim().to_string());
    task.last_result = std::fs::read_to_string(directory.join("exit"))
        .ok()
        .map(|s| s.trim().to_string());
    if task
        .last_result
        .as_deref()
        .is_some_and(|result| result != "0")
        && task.status != "running"
        && task.status != "paused"
    {
        task.status = "error".into();
    }
}

pub(super) fn find(id: &str) -> Result<AutomationTask, String> {
    super::overview(None)
        .tasks
        .into_iter()
        .find(|t| t.id == id)
        .ok_or_else(|| "Task not found; refresh the automation list".into())
}

/// Create or update an automation. Native jobs are always current-user jobs;
/// external system jobs cannot be edited by supplying their displayed IDs.
pub fn save(
    id: Option<&str>,
    revision: Option<u64>,
    mut draft: AutomationDraft,
) -> Result<String, String> {
    draft.validate()?;
    // An explicit edit can repair an invalid workspace script.
    if let Err(error) = super::sync_workspace_scripts() {
        log::warn!("Cannot synchronize automation scripts before saving: {error}");
    }
    let root = store::root();
    let _lock = store::Lock::acquire(&root)?;
    let mut records = store::load(&root)?;
    let old_index = id.and_then(|id| records.iter().position(|r| r.id == id));
    let old = old_index.map(|i| records[i].clone());
    if let Some(id) = id {
        let task = find(id)?;
        if !task.can_edit {
            return Err(
                "This existing system task is read-only; create an AgentHub task to manage it"
                    .into(),
            );
        }
        if task.status == "running" {
            return Err("Wait for the current run to finish before editing".into());
        }
        if task.source == "hermes" {
            if draft.provider != Provider::Hermes {
                return Err("Cannot change task scheduler".into());
            }
            if old
                .as_ref()
                .is_some_and(|old| Some(old.revision) != revision)
            {
                return Err("Task changed; refresh before saving".into());
            }
            super::workspace::ensure(&mut draft, id, &task.location)?;
            hermes_manage::edit(&task, &draft)?;
            if let Some(index) = old_index {
                records[index].draft = draft;
                records[index].revision += 1;
                store::save(&root, records).map_err(|e| {
                    format!(
                        "Hermes saved the task, but creation metadata could not be updated: {e}"
                    )
                })?;
            }
            return Ok(id.into());
        }
    }
    if let Some(old) = &old {
        verify(&root, old)?;
        if Some(old.revision) != revision {
            return Err("Task changed; refresh before saving".into());
        }
        if old.draft.provider != draft.provider {
            return Err("Cannot change task scheduler".into());
        }
    } else if id.is_some() {
        return Err("No managed creation record exists for this task".into());
    }
    let id = id
        .map(str::to_owned)
        .unwrap_or_else(|| format!("agent_hub:{}", uuid::Uuid::new_v4()));
    super::workspace::ensure(&mut draft, &id, "")?;
    if draft.provider == Provider::System {
        native::shell_entry::prepare(&mut draft, &id, old.as_ref())?;
        draft.validate()?;
    }
    if draft.provider == Provider::Hermes {
        let (identifier, location) = hermes_manage::create(&draft)?;
        records.push(ManagedAutomation {
            id: id.clone(),
            revision: 1,
            draft,
            source: "hermes".into(),
            identifier: identifier.clone(),
            location: location.clone(),
        });
        if let Err(error) = store::save(&root, records) {
            let rollback = hermes_manage::action_at(&hermes_manage::home()?, "remove", &identifier);
            return Err(format!(
                "Cannot save creation record: {error}; rollback: {rollback:?}"
            ));
        }
    } else {
        let next = native_record(
            &root,
            id.clone(),
            draft,
            old.as_ref().map_or(1, |r| r.revision + 1),
        )?;
        if old.is_none() && !cfg!(windows) && Path::new(&next.location).exists() {
            return Err("Native task location already exists".into());
        }
        native_transaction(&root, &next, old.as_ref(), || {
            if let Some(index) = old_index {
                records[index] = next.clone();
            } else {
                records.push(next.clone());
            }
            store::save(&root, records)
        })?;
        if let Err(error) =
            native::payload::archive_legacy(&native::directory(&root, &next), &next.draft, &next.id)
        {
            log::warn!("Cannot archive legacy automation script: {error}");
        }
    }
    Ok(id)
}

fn native_transaction(
    root: &Path,
    next: &ManagedAutomation,
    old: Option<&ManagedAutomation>,
    commit: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    transition(
        || native::apply(root, next),
        commit,
        || {
            if let Some(old) = old {
                native::apply(root, old)
            } else {
                native::remove(root, next)
            }
        },
    )
}

fn transition(
    apply: impl FnOnce() -> Result<(), String>,
    commit: impl FnOnce() -> Result<(), String>,
    rollback: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    let result = apply().and_then(|()| commit());
    if let Err(error) = result {
        let rollback = rollback();
        return Err(format!("{error}; scheduler rollback: {rollback:?}"));
    }
    Ok(())
}

/// Requests a single native/Hermes execution. The recurring schedule is untouched.
pub fn run(id: &str) -> Result<(), String> {
    super::sync_workspace_scripts()?;
    upgrade_runners();
    let root = store::root();
    let _lock = store::Lock::acquire(&root)?;
    let task = find(id)?;
    if !task.can_run {
        return Err("Manual runs are available for AgentHub tasks and Hermes tasks".into());
    }
    if task.status == "running" {
        return Err("This task is already running".into());
    }
    if task.source == "hermes" {
        hermes_manage::run(&task)
    } else {
        let record = store::load(&root)?
            .into_iter()
            .find(|r| r.id == id)
            .ok_or("Missing creation record")?;
        verify(&root, &record)?;
        native::run(&root, &record)
    }
}

pub fn remove(id: &str) -> Result<(), String> {
    let root = store::root();
    let _lock = store::Lock::acquire(&root)?;
    let mut records = store::load(&root)?;
    let task = find(id)?;
    if !task.can_edit {
        return Err("This existing system task is read-only".into());
    }
    if task.status == "running" {
        return Err("Wait for the current run to finish before deleting".into());
    }
    let mut directory = None;
    if task.source == "hermes" {
        hermes_manage::action_at(
            &hermes_manage::root_for(&task)?,
            "remove",
            task.identifier.as_deref().ok_or("Missing Hermes ID")?,
        )?;
    } else {
        let record = records
            .iter()
            .find(|r| r.id == id)
            .ok_or("Missing creation record")?;
        verify(&root, record)?;
        native::remove(&root, record)?;
        directory = Some(native::directory(&root, record));
    }
    records.retain(|r| r.id != id);
    store::save(&root, records)
        .map_err(|e| format!("Scheduler task removed; metadata cleanup failed: {e}"))?;
    if let Some(directory) = directory.filter(|path| path.exists()) {
        std::fs::remove_dir_all(directory)
            .map_err(|e| format!("Task deleted; cannot remove its scripts and output: {e}"))?;
    }
    Ok(())
}

/// Migrate idle owned runners; active jobs are retried on their completion event.
pub(crate) fn upgrade_runners() {
    let root = store::root();
    if !root.join("tasks.json").is_file() {
        return;
    }
    let Ok(_lock) = store::Lock::acquire(&root) else {
        return;
    };
    let Ok(mut records) = store::load(&root) else {
        return;
    };
    for index in 0..records.len() {
        let old = records[index].clone();
        if old.draft.provider != Provider::System
            || verify(&root, &old).is_err()
            || !native::needs_upgrade(&root, &old)
            || native::state(&old) != Some(false)
        {
            continue;
        }
        let result = (|| {
            let mut next = old.clone();
            let normalized = if next.draft.workdir.is_some() {
                native::shell_entry::prepare(&mut next.draft, &next.id, Some(&old))?
            } else {
                false
            };
            next.draft.validate()?;
            if normalized {
                next.revision = next
                    .revision
                    .checked_add(1)
                    .ok_or("Automation revision exhausted")?;
            }
            let mut updated = records.clone();
            updated[index] = next.clone();
            transition(
                || native::refresh_runner(&root, &next),
                || {
                    if normalized {
                        store::save(&root, updated.clone())
                    } else {
                        Ok(())
                    }
                },
                || native::refresh_runner(&root, &old),
            )?;
            records = updated;
            if let Err(error) = native::payload::archive_legacy(
                &native::directory(&root, &next),
                &next.draft,
                &next.id,
            ) {
                log::warn!("Cannot archive legacy automation script: {error}");
            }
            Ok::<_, String>(())
        })();
        if let Err(error) = result {
            log::warn!("Cannot upgrade automation runner: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn persistence_failure_rolls_back_the_scheduler_and_surfaces_rollback_failure() {
        let rolled_back = std::cell::Cell::new(false);
        let error = transition(
            || Ok(()),
            || Err("disk full".into()),
            || {
                rolled_back.set(true);
                Err("scheduler unavailable".into())
            },
        )
        .unwrap_err();
        assert!(rolled_back.get());
        assert!(error.contains("disk full") && error.contains("scheduler unavailable"));
        let committed = std::cell::Cell::new(false);
        assert!(transition(
            || Err("registration failed".into()),
            || {
                committed.set(true);
                Ok(())
            },
            || Ok(())
        )
        .is_err());
        assert!(!committed.get());
    }
    #[test]
    fn only_exact_registered_provider_and_scope_claim_ownership() {
        let dir = tempfile::tempdir().unwrap();
        let draft = AutomationDraft {
            files: Vec::new(),
            name: "Audit".into(),
            provider: Provider::System,
            content: "exit 0".into(),
            workdir: None,
            schedule: Schedule::Manual,
            enabled: true,
        };
        let record = native_record(
            dir.path(),
            format!("agent_hub:{}", uuid::Uuid::new_v4()),
            draft,
            1,
        )
        .unwrap();
        let mut original = AutomationTask::new(
            "native".into(),
            "Audit".into(),
            &record.source,
            record.location.clone(),
        );
        original.identifier = Some(record.identifier.clone());
        let mut impostor = original.clone();
        impostor.id = "impostor".into();
        impostor.location = "different-scope".into();
        let mut report = AutomationOverview {
            tasks: vec![original, impostor],
            ..Default::default()
        };
        merge(&mut report, dir.path());
        assert!(report
            .tasks
            .iter()
            .all(|t| t.origin == TaskOrigin::External));
        store::save(dir.path(), vec![record.clone()]).unwrap();
        merge(&mut report, dir.path());
        assert_eq!(report.tasks.len(), 2);
        assert_eq!(
            report
                .tasks
                .iter()
                .find(|t| t.id == record.id)
                .unwrap()
                .origin,
            TaskOrigin::AgentHub
        );
        assert_eq!(
            report
                .tasks
                .iter()
                .find(|t| t.id == "impostor")
                .unwrap()
                .origin,
            TaskOrigin::External
        );
    }
    #[test]
    fn malformed_registry_keeps_external_tasks_and_does_not_enable_native_mutations() {
        let dir = tempfile::tempdir().unwrap();
        store::write(&dir.path().join("tasks.json"), b"bad").unwrap();
        let mut report = AutomationOverview {
            tasks: vec![AutomationTask::new(
                "audit".into(),
                "AgentHub audit".into(),
                "launchd",
                "<workspace>".into(),
            )],
            ..Default::default()
        };
        merge(&mut report, dir.path());
        assert_eq!(report.tasks[0].origin, TaskOrigin::Unknown);
        assert!(!report.tasks[0].can_edit);
        assert_eq!(report.issues.len(), 1);
    }
}
