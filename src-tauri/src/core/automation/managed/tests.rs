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
    assert!(finish_removal(&case.state, &case.record.id, registry.tasks, Some(cleanup)).is_err());
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
