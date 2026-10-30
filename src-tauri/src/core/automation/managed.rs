use super::{
    definition::{AutomationDraft, ManagedAutomation, Provider, Schedule},
    hermes_manage, native, store, AutomationOverview, AutomationTask, TaskOrigin,
};
use std::path::Path;

pub(super) fn native_record(
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
    let registry = match store::read_registry(root) {
        Ok(registry) => registry,
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
    for error in &registry.issues {
        report.issue("agent_hub", error.clone());
    }
    for record in registry.tasks {
        let removal_pending = registry.removal_pending.contains(&record.id);
        if let Err(error) = verify(root, &record) {
            report.issue("agent_hub", error);
            continue;
        }
        let index = report.tasks.iter().position(|task| {
            task.source == record.source
                && task.identifier.as_deref() == Some(&record.identifier)
                && task.location == record.location
        });
        let installation = super::package::state(&record);
        if record.draft.provider == Provider::Hermes
            && index.is_none()
            && !removal_pending
            && installation.is_none()
        {
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
        task.installation = installation.clone();
        if installation.is_some() {
            task.definition = Some(record.draft.clone());
            task.name = record.draft.name.clone();
            task.project = record.draft.workdir.clone();
            task.schedule = record.draft.schedule.display();
        }
        if record.draft.provider == Provider::System {
            task.name = record.draft.name.clone();
            task.identifier = Some(record.identifier.clone());
            task.schedule = record.draft.schedule.display();
            task.project = record.draft.workdir.clone();
            task.command = Some(record.draft.content.clone());
            task.prompt = record
                .draft
                .files
                .iter()
                .find(|file| file.path == "prompt.md" || file.path.ends_with("/prompt.md"))
                .map(|file| file.content.clone());
            let mut definition = record.draft.clone();
            super::workspace::separate(&mut definition, &record.id);
            task.project = definition.workdir.clone();
            task.definition = Some(definition);
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
        if removal_pending {
            task.status = "error".into();
            task.can_run = false;
            task.name = record.draft.name.clone();
            task.definition = Some(record.draft.clone());
            task.revision = Some(record.revision);
        }
        if let Some(installation) = installation {
            if installation != "installed" {
                task.can_run = false;
                task.status = if installation == "uninstalled" {
                    "paused"
                } else {
                    "error"
                }
                .into();
                task.next_run = None;
            }
            if let Ok(receipt) = super::package::receipt(&record) {
                if receipt.error.is_some() {
                    task.last_result = receipt.error;
                }
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
/// supported current-user external LaunchAgents are edited in their original scope.
pub fn save(
    id: Option<&str>,
    revision: Option<u64>,
    mut draft: AutomationDraft,
) -> Result<String, String> {
    draft.validate()?;
    if id.is_none() || id.is_some_and(|id| super::package::find(&store::root(), id).is_ok()) {
        if let Some(id) = id {
            if store::legacy_task(&store::root(), id)?.is_some() {
                return Err("Task migration is pending; retry migration before editing".into());
            }
        }
        return super::package::save(id, revision, draft);
    }
    // An explicit edit can repair an invalid workspace script.
    if let Err(error) = super::sync_workspace_scripts() {
        log::warn!("Cannot synchronize automation scripts before saving: {error}");
    }
    let root = store::root();
    let _lock = store::Lock::acquire(&root)?;
    let registry = store::read_registry(&root)?;
    if id.is_some_and(|id| registry.removal_pending.contains(id)) {
        return Err("Task removal is pending; retry deletion before editing".into());
    }
    let mut records = registry.tasks;
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
        #[cfg(target_os = "macos")]
        if task.source == "launchd" && old.is_none() {
            return super::external_launchd::save(&task, revision, &draft);
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
    if draft.provider == Provider::System {
        if draft.script_dir.is_none() {
            draft.script_dir = old
                .as_ref()
                .and_then(|record| record.draft.scripts_dir().map(str::to_owned));
        }
        super::workspace::ensure_scripts(&mut draft, &id)?;
    } else {
        super::workspace::ensure(&mut draft, &id, "")?;
    }
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
    let package = super::package::find(&root, id).ok();
    if package.is_some() && store::legacy_task(&root, id)?.is_some() {
        return Err("Task migration is pending; finish migration before running".into());
    }
    let _task_lock = if package.is_some() {
        Some(super::package::lock(&root, id)?)
    } else {
        None
    };
    if package
        .as_ref()
        .is_some_and(|r| super::package::state(r).as_deref() != Some("installed"))
    {
        return Err("Install the task successfully before running it".into());
    }
    let _lock = store::Lock::acquire(&root)?;
    if store::read_registry(&root)?.removal_pending.contains(id) {
        return Err("Task removal is pending; retry deletion before running".into());
    }
    let task = find(id)?;
    if !task.can_run {
        return Err("Manual runs are available for AgentHub tasks and Hermes tasks".into());
    }
    if task.status == "running" {
        return Err("This task is already running".into());
    }
    #[cfg(target_os = "macos")]
    if task.source == "launchd" && task.origin == TaskOrigin::External {
        return super::external_launchd::run(&task);
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

/// Remove a task while preserving its local files by default.
pub fn remove(id: &str) -> Result<(), String> {
    remove_with_local_data(id, false)
}

/// Optional cleanup is restricted to assigned/legacy workspaces and internal data.
pub fn remove_with_local_data(id: &str, delete_local_data: bool) -> Result<(), String> {
    let root = store::root();
    if super::package::find(&root, id).is_ok() {
        return super::package::remove(id, delete_local_data);
    }
    let _lock = store::Lock::acquire(&root)?;
    let mut registry = store::read_registry(&root)?;
    let record = registry.tasks.iter().find(|record| record.id == id);
    if delete_local_data && record.is_none() {
        return Err("Local-data cleanup requires an AgentHub creation record".into());
    }
    if let Some(record) = record {
        verify(&root, record)?;
    }
    let report = super::overview(None);
    let cleanup = if delete_local_data {
        Some(
            super::local_data::Cleanup::plan(
                &root,
                &super::workspace::workspace_root(),
                record.ok_or("Missing creation record")?,
                &registry.tasks,
            )?
            .protect_workspaces(
                report
                    .tasks
                    .iter()
                    .filter(|task| task.id != id)
                    .filter_map(|task| task.project.as_ref().map(std::path::PathBuf::from)),
            ),
        )
    } else {
        None
    };
    if !registry.removal_pending.contains(id) {
        let task = report
            .tasks
            .into_iter()
            .find(|task| task.id == id)
            .ok_or("Task not found; refresh the automation list")?;
        if !task.can_edit {
            return Err("This existing system task is read-only".into());
        }
        if task.status == "running" {
            return Err("Wait for the current run to finish before deleting".into());
        }
        #[cfg(target_os = "macos")]
        if task.source == "launchd" && record.is_none() {
            return super::external_launchd::remove(&task);
        }
        if task.source == "hermes" {
            hermes_manage::action_at(
                &hermes_manage::root_for(&task)?,
                "remove",
                task.identifier.as_deref().ok_or("Missing Hermes ID")?,
            )?;
        } else {
            native::remove(&root, record.ok_or("Missing creation record")?)?;
        }
        if record.is_some() {
            registry.removal_pending.insert(id.into());
            store::write_registry(&root, &registry).map_err(|error| {
                format!("Scheduler task removed; cannot persist cleanup state: {error}")
            })?;
        }
    }
    finish_removal(&root, id, registry.tasks, cleanup)
}

fn finish_removal(
    root: &Path,
    id: &str,
    mut records: Vec<ManagedAutomation>,
    cleanup: Option<super::local_data::Cleanup>,
) -> Result<(), String> {
    if let Some(cleanup) = cleanup {
        cleanup.remove()?;
    }
    records.retain(|record| record.id != id);
    store::save(root, records)
        .map_err(|error| format!("Scheduler task removed; metadata cleanup failed: {error}"))
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
    let Ok(registry) = store::read_registry(&root) else {
        return;
    };
    let mut records = registry.tasks;
    for index in 0..records.len() {
        let old = records[index].clone();
        if super::package::find(&root, &old.id).is_ok()
            || registry.removal_pending.contains(&old.id)
            || old.draft.provider != Provider::System
            || verify(&root, &old).is_err()
            || !native::needs_upgrade(&root, &old)
            || native::state(&old) != Some(false)
        {
            continue;
        }
        let result = (|| {
            let mut next = old.clone();
            let normalized = if next.draft.scripts_dir().is_some() {
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
    fn unchecked_removal_preserves_local_data_and_queues_definition_deletion() {
        let case = super::super::local_data::tests::Fixture::new();
        store::save(&case.state, vec![case.record.clone()]).unwrap();
        finish_removal(
            &case.state,
            &case.record.id,
            vec![case.record.clone()],
            None,
        )
        .unwrap();
        assert!(case.workspace.join("result.txt").exists());
        assert!(native::directory(&case.state, &case.record).exists());
        let registry = store::read_registry(&case.state).unwrap();
        assert!(registry.tasks.is_empty());
        assert_eq!(registry.pending_backup.get(&case.record.id), Some(&None));
    }

    #[test]
    fn cleanup_failure_preserves_pending_record_and_successful_retry_removes_it() {
        let case = super::super::local_data::tests::Fixture::new();
        store::save(&case.state, vec![case.record.clone()]).unwrap();
        let mut registry = store::read_registry(&case.state).unwrap();
        registry.removal_pending.insert(case.record.id.clone());
        store::write_registry(&case.state, &registry).unwrap();
        let cleanup = super::super::local_data::Cleanup::plan(
            &case.state,
            &case.root,
            &case.record,
            &registry.tasks,
        )
        .unwrap();
        std::fs::remove_dir_all(&case.workspace).unwrap();
        std::fs::write(&case.workspace, "unexpected file").unwrap();
        assert!(
            finish_removal(&case.state, &case.record.id, registry.tasks, Some(cleanup)).is_err()
        );
        let registry = store::read_registry(&case.state).unwrap();
        assert_eq!(registry.tasks.len(), 1);
        assert!(registry.removal_pending.contains(&case.record.id));
        std::fs::remove_file(&case.workspace).unwrap();
        std::fs::create_dir(&case.workspace).unwrap();
        let cleanup = super::super::local_data::Cleanup::plan(
            &case.state,
            &case.root,
            &case.record,
            &registry.tasks,
        )
        .unwrap();
        finish_removal(&case.state, &case.record.id, registry.tasks, Some(cleanup)).unwrap();
        let registry = store::read_registry(&case.state).unwrap();
        assert!(registry.tasks.is_empty() && registry.removal_pending.is_empty());
        assert!(!case.workspace.exists());
    }

    #[test]
    fn pending_hermes_removal_stays_visible_for_retry_when_provider_record_is_gone() {
        let mut case = super::super::local_data::tests::Fixture::new();
        case.record.draft.provider = Provider::Hermes;
        case.record.source = "hermes".into();
        store::save(&case.state, vec![case.record.clone()]).unwrap();
        let mut registry = store::read_registry(&case.state).unwrap();
        registry.removal_pending.insert(case.record.id.clone());
        store::write_registry(&case.state, &registry).unwrap();
        let mut report = AutomationOverview::default();
        merge(&mut report, &case.state);
        let task = report
            .tasks
            .iter()
            .find(|task| task.id == case.record.id)
            .unwrap();
        assert!(task.can_edit && !task.can_run);
        assert_eq!(task.status, "error");
        super::super::script_sync::sync_at(&case.state).unwrap();
        assert_eq!(store::load(&case.state).unwrap()[0].revision, 1);
    }

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
            package_options: None,
            files: Vec::new(),
            name: "Audit".into(),
            provider: Provider::System,
            content: "exit 0".into(),
            script_dir: None,
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
