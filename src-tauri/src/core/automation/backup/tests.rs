use super::*;
#[test]
#[cfg(feature = "cloud-sync")]
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
    let directory = "automations/audit";
    let path = format!("{directory}/config/task.json");
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
    let script_name = if cfg!(windows) { "run.ps1" } else { "run.sh" };
    let blob = remote
        .find_blob(
            updated_tree
                .get_path(Path::new(&format!("{directory}/scripts/{script_name}")))
                .unwrap()
                .id(),
        )
        .unwrap();
    assert_eq!(
        std::str::from_utf8(blob.content()).unwrap(),
        "printf changed"
    );
    let helper = remote
        .find_blob(
            updated_tree
                .get_path(Path::new(&format!("{directory}/scripts/main.py")))
                .unwrap()
                .id(),
        )
        .unwrap();
    assert_eq!(
        std::str::from_utf8(helper.content()).unwrap(),
        "print('customized script')"
    );
    assert_eq!(std::fs::read_to_string(&script).unwrap(), "printf changed");
    backup_workspace::restore(&db, &tag).unwrap();
    assert!(list().unwrap()[0]
        .draft
        .files
        .iter()
        .any(|f| f.content == "printf original"));
    assert_eq!(
        store::load(&runtime).unwrap()[0].draft.content,
        "printf changed",
        "restoring Git must not edit local schedulers"
    );
    flush(&super::super::super::sync_metadata::metadata_dir()).unwrap();
    assert!(
        list().unwrap()[0]
            .draft
            .files
            .iter()
            .any(|f| f.content == "printf original"),
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
