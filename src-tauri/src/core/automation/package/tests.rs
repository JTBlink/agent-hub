use super::super::{AutomationScriptFile, Provider, Schedule};
use super::*;

fn draft() -> AutomationDraft {
    AutomationDraft {
        package_options: None,
        name: "Audit".into(),
        provider: Provider::System,
        content: "printf package-output".into(),
        workdir: None,
        script_dir: None,
        schedule: Schedule::Manual,
        enabled: false,
        files: Vec::new(),
    }
}

#[test]
fn same_name_tasks_have_independent_packages_and_corruption_is_isolated() {
    let temp = tempfile::tempdir().unwrap();
    let first = lifecycle::create(temp.path(), draft(), Vec::new(), false).unwrap();
    let second = lifecycle::create(temp.path(), draft(), Vec::new(), false).unwrap();
    let one = find(temp.path(), &first).unwrap();
    let two = find(temp.path(), &second).unwrap();
    assert_ne!(one.draft.script_dir, two.draft.script_dir);
    let path = directory(&one).unwrap();
    assert!(path.join("scripts/run.sh").exists() || path.join("scripts/run.ps1").exists());
    assert!(path.join("README.md").is_file());
    assert!(path.join(".local/receipt.json").is_file());
    assert!(!temp.path().join("tasks.json").exists());
    fs_write(&path.join("task.json"), "broken");
    let registry = store::read_registry(temp.path()).unwrap();
    assert_eq!(registry.tasks.len(), 1);
    assert_eq!(registry.tasks[0].id, second);
    assert_eq!(registry.issues.len(), 1);
}

#[test]
fn missing_or_damaged_legacy_index_does_not_hide_new_packages() {
    let temp = tempfile::tempdir().unwrap();
    let id = lifecycle::create(temp.path(), draft(), Vec::new(), false).unwrap();
    fs_write(&temp.path().join("tasks.json"), "corrupted");
    let registry = store::read_registry(temp.path()).unwrap();
    assert_eq!(registry.tasks[0].id, id);
    assert_eq!(registry.issues.len(), 1);
    assert!(store::write_registry(temp.path(), &registry).is_err());
    assert_eq!(
        std::fs::read_to_string(temp.path().join("tasks.json")).unwrap(),
        "corrupted"
    );
}

#[test]
fn import_preview_reads_only_declared_portable_files_and_never_runs_commands() {
    let temp = tempfile::tempdir().unwrap();
    let mut task = draft();
    task.content = "exit 79".into();
    let id = lifecycle::create(temp.path(), task, Vec::new(), false).unwrap();
    let record = find(temp.path(), &id).unwrap();
    let path = directory(&record).unwrap();
    fs_write(&path.join(".local/secret"), "private-value");
    let preview = preview_package(&path).unwrap();
    assert!(!preview.draft.enabled);
    assert!(preview.draft.workdir.is_none() && preview.draft.script_dir.is_none());
    assert!(!serde_json::to_string(&preview)
        .unwrap()
        .contains("private-value"));
    assert!(path.join(".local/runs").read_dir().is_err());
    let mut malicious = preview.clone();
    malicious.draft.files.push(AutomationScriptFile {
        path: "scripts/../../outside.sh".into(),
        content: "exit 0".into(),
    });
    assert!(malicious.validate().is_err());
    malicious.draft.files.last_mut().unwrap().path = ".local/secret.md".into();
    assert!(malicious.validate().is_err());
    malicious = preview;
    malicious.draft.workdir = Some("~/projects/demo".into());
    assert!(malicious.validate().is_err());
}

#[test]
fn script_edits_invalidate_revision_and_backup_uses_the_actual_body() {
    let temp = tempfile::tempdir().unwrap();
    let id = lifecycle::create(temp.path(), draft(), Vec::new(), false).unwrap();
    let original = find(temp.path(), &id).unwrap();
    let path = directory(&original).unwrap();
    let entry = super::super::native::shell_entry::entry(&original.draft).unwrap();
    fs_write(&path.join(&entry.path), "printf edited-body");
    let registry = store::read_registry(temp.path()).unwrap();
    assert_ne!(registry.tasks[0].revision, original.revision);
    assert!(registry.pending_backup[&id]
        .as_ref()
        .unwrap()
        .files
        .iter()
        .any(|f| f.content == "printf edited-body"));
    store::write_registry(temp.path(), &registry).unwrap();
    assert_eq!(
        find(temp.path(), &id).unwrap().revision,
        registry.tasks[0].revision
    );
}

#[test]
fn lifecycle_locks_block_the_same_task_without_blocking_other_tasks() {
    let temp = tempfile::tempdir().unwrap();
    let first = format!("agent_hub:{}", uuid::Uuid::new_v4());
    let second = format!("agent_hub:{}", uuid::Uuid::new_v4());
    let held = lock(temp.path(), &first).unwrap();
    assert!(lock(temp.path(), &first).is_err());
    assert!(lock(temp.path(), &second).is_ok());
    drop(held);
    assert!(lock(temp.path(), &first).is_ok());
}

#[cfg(unix)]
#[test]
fn package_runner_checks_installation_before_entering_the_body_and_releases_its_claim() {
    let temp = tempfile::tempdir().unwrap();
    let id = lifecycle::create(temp.path(), draft(), Vec::new(), false).unwrap();
    let record = find(temp.path(), &id).unwrap();
    let path = directory(&record).unwrap();
    let runtime = path.join(".local");
    super::super::native::refresh_runner(temp.path(), &record).unwrap();
    let run = || {
        std::process::Command::new("/bin/sh")
            .arg(runtime.join("run.sh"))
            .status()
            .unwrap()
    };
    assert!(run().success());
    assert!(!runtime.join("started").exists());
    assert!(!runtime.join("run.claim").exists());
    fs_write(&runtime.join("ready"), "1");
    assert!(run().success());
    assert_eq!(
        std::fs::read_to_string(runtime.join("output.log")).unwrap(),
        "package-output"
    );
    assert!(!runtime.join("run.claim").exists());
    assert!(runtime.join("runs").is_dir());
}

#[cfg(unix)]
#[test]
fn linked_files_cannot_escape_the_package_during_import_or_read() {
    let temp = tempfile::tempdir().unwrap();
    let id = lifecycle::create(temp.path(), draft(), Vec::new(), false).unwrap();
    let record = find(temp.path(), &id).unwrap();
    let path = directory(&record).unwrap();
    let outside = temp.path().join("outside.md");
    fs_write(&outside, "private outside content");
    std::fs::remove_file(path.join("README.md")).unwrap();
    std::os::unix::fs::symlink(&outside, path.join("README.md")).unwrap();
    assert!(read(&path).is_err());
    assert!(preview_package(&path).is_err());
    assert_eq!(
        std::fs::read_to_string(outside).unwrap(),
        "private outside content"
    );
}

fn fs_write(path: &Path, content: &str) {
    std::fs::write(path, content).unwrap();
}

#[derive(Default)]
struct Scheduler {
    calls: Vec<String>,
    fail_registration: bool,
    fail_removal: bool,
    fail_on_call: Option<usize>,
}
impl super::registration::Registration for Scheduler {
    fn apply(&mut self, _: &Path, _: &mut ManagedAutomation, enabled: bool) -> Result<(), String> {
        self.calls.push(format!("register:{enabled}"));
        if self.fail_registration || self.fail_on_call == Some(self.calls.len()) {
            Err("registration failed".into())
        } else {
            Ok(())
        }
    }
    fn remove(&mut self, _: &Path, _: &ManagedAutomation) -> Result<(), String> {
        self.calls.push("remove".into());
        if self.fail_removal {
            Err("removal failed".into())
        } else {
            Ok(())
        }
    }
}

#[test]
fn interrupted_updates_restore_the_previous_body_before_reinstalling() {
    let temp = tempfile::tempdir().unwrap();
    let id = lifecycle::create(temp.path(), draft(), Vec::new(), false).unwrap();
    let record = find(temp.path(), &id).unwrap();
    let path = directory(&record).unwrap();
    let mut local = receipt(&record).unwrap();
    let manifest: Manifest = storage::json(&path.join("task.json")).unwrap();
    json_write(
        &path.join(".local/operation.json"),
        &UpdateSnapshot {
            record: record.clone(),
            receipt: local.clone(),
            manifest,
        },
    )
    .unwrap();
    local.state = "updating".into();
    write_receipt(&record, &local).unwrap();
    fs_write(&path.join("task.json"), "interrupted write");
    let observed = find(temp.path(), &id).unwrap();
    assert_eq!(observed.draft, record.draft);
    let mut scheduler = Scheduler::default();
    lifecycle::install_using(temp.path(), &observed, &mut scheduler).unwrap();
    assert_eq!(find(temp.path(), &id).unwrap().draft, record.draft);
    assert_eq!(receipt(&record).unwrap().state, "installed");
    assert!(!path.join(".local/operation.json").exists());
}

fn legacy(state: &Path) -> ManagedAutomation {
    let project = state.join("project");
    std::fs::create_dir_all(&project).unwrap();
    let mut input = draft();
    input.enabled = true;
    input.workdir = Some(project.to_string_lossy().into_owned());
    let record = super::super::managed::native_record(
        state,
        format!("agent_hub:{}", uuid::Uuid::new_v4()),
        input,
        3,
    )
    .unwrap();
    store::save(state, vec![record.clone()]).unwrap();
    super::super::native::payload::write(
        &super::super::native::directory(state, &record),
        &record.draft,
        &record.id,
        true,
    )
    .unwrap();
    record
}

#[test]
fn explicit_migration_preserves_identity_schedule_and_original_project_files() {
    let temp = tempfile::tempdir().unwrap();
    let original = legacy(temp.path());
    let mut scheduler = Scheduler::default();
    assert_eq!(
        migration::migrate_using(temp.path(), &original.id, &mut scheduler).unwrap(),
        original.id
    );
    assert!(store::legacy_task(temp.path(), &original.id)
        .unwrap()
        .is_none());
    let package = find(temp.path(), &original.id).unwrap();
    assert_eq!(package.draft.workdir, original.draft.workdir);
    assert_eq!(package.draft.schedule, original.draft.schedule);
    assert_eq!(package.revision, 4);
    assert!(package.draft.enabled);
    assert!(
        Path::new(original.draft.workdir.as_ref().unwrap())
            .read_dir()
            .unwrap()
            .count()
            > 0
    );
    assert_eq!(scheduler.calls.last().unwrap(), "register:true");
    let calls = scheduler.calls.len();
    migration::migrate_using(temp.path(), &original.id, &mut scheduler).unwrap();
    assert_eq!(scheduler.calls.len(), calls);
}

#[test]
fn migration_failure_restores_legacy_metadata_and_can_resume_without_another_package() {
    let temp = tempfile::tempdir().unwrap();
    let original = legacy(temp.path());
    let mut scheduler = Scheduler {
        fail_on_call: Some(4),
        ..Default::default()
    };
    assert!(migration::migrate_using(temp.path(), &original.id, &mut scheduler).is_err());
    assert!(store::legacy_task(temp.path(), &original.id)
        .unwrap()
        .is_some());
    let path = directory(&find(temp.path(), &original.id).unwrap()).unwrap();
    assert!(!path.join(".local/ready").exists());
    scheduler.fail_on_call = None;
    migration::migrate_using(temp.path(), &original.id, &mut scheduler).unwrap();
    assert_eq!(
        directory(&find(temp.path(), &original.id).unwrap()).unwrap(),
        path
    );
    assert!(store::legacy_task(temp.path(), &original.id)
        .unwrap()
        .is_none());
}

#[test]
fn exported_and_backed_up_requirements_survive_import_without_local_bindings_or_installation() {
    use crate::core::central_repo;
    let _guard = central_repo::test_base_dir_lock();
    let temp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(temp.path().join("app")));
    struct Reset;
    impl Drop for Reset {
        fn drop(&mut self) {
            central_repo::set_test_base_dir_override(None);
        }
    }
    let _reset = Reset;
    let state = store::root();
    let requirements = vec![Dependency::Python {
        packages: vec!["demo-package==1.0".into()],
    }];
    let id = lifecycle::create(&state, draft(), requirements.clone(), false).unwrap();
    let record = find(&state, &id).unwrap();
    fs_write(
        &directory(&record).unwrap().join(".local/private.md"),
        "private-session",
    );
    let output = temp.path().join("portable.json");
    export_package(&id, &output).unwrap();
    let contents = std::fs::read_to_string(&output).unwrap();
    assert!(export_package(&id, &output).is_err());
    assert_eq!(std::fs::read_to_string(&output).unwrap(), contents);
    assert!(!contents.contains(&id) && !contents.contains("private-session"));
    assert!(!contents.contains(&state.to_string_lossy().to_string()));
    let preview = preview_package(&output).unwrap();
    assert_eq!(preview.dependencies, requirements);
    let imported_id = import_package(&output, None).unwrap();
    assert_ne!(imported_id, id);
    let imported = find(&state, &imported_id).unwrap();
    assert_eq!(receipt(&imported).unwrap().state, "uninstalled");
    assert_eq!(
        imported
            .draft
            .package_options
            .as_ref()
            .unwrap()
            .dependencies,
        requirements
    );
    let meta = temp.path().join("metadata");
    super::super::backup::flush(&meta).unwrap();
    let file = meta.join(format!(
        "automation-{}.json",
        id.trim_start_matches("agent_hub:")
    ));
    let backup: super::super::AutomationBackup =
        serde_json::from_slice(&std::fs::read(file).unwrap()).unwrap();
    assert_eq!(
        backup.draft.package_options.unwrap().dependencies,
        requirements
    );
    assert!(!super::super::backup::needs_export());
}

#[test]
fn failed_installation_stays_visible_and_retry_finishes_without_running_the_body() {
    let temp = tempfile::tempdir().unwrap();
    let id = lifecycle::create(temp.path(), draft(), Vec::new(), false).unwrap();
    let record = find(temp.path(), &id).unwrap();
    let mut scheduler = Scheduler {
        fail_registration: true,
        ..Default::default()
    };
    assert!(lifecycle::install_using(temp.path(), &record, &mut scheduler).is_err());
    assert_eq!(receipt(&record).unwrap().state, "install_failed");
    assert_eq!(scheduler.calls, ["register:false", "remove"]);
    assert!(!directory(&record).unwrap().join(".local/ready").exists());
    scheduler.fail_registration = false;
    lifecycle::install_using(temp.path(), &record, &mut scheduler).unwrap();
    assert_eq!(receipt(&record).unwrap().state, "installed");
    assert!(directory(&record).unwrap().join(".local/ready").exists());
    let calls = scheduler.calls.len();
    lifecycle::install_using(temp.path(), &record, &mut scheduler).unwrap();
    assert_eq!(scheduler.calls.len(), calls);
    assert!(!directory(&record).unwrap().join(".local/started").exists());
}

#[test]
fn uninstall_retries_preserve_scripts_and_external_projects_and_release_only_owned_dependencies() {
    let temp = tempfile::tempdir().unwrap();
    let project = temp.path().join("project");
    std::fs::create_dir(&project).unwrap();
    fs_write(&project.join("keep"), "keep");
    let mut task = draft();
    task.workdir = Some(project.to_string_lossy().into_owned());
    let id = lifecycle::create(temp.path(), task, Vec::new(), false).unwrap();
    let record = find(temp.path(), &id).unwrap();
    let path = directory(&record).unwrap();
    let mut scheduler = Scheduler::default();
    lifecycle::install_using(temp.path(), &record, &mut scheduler).unwrap();
    std::fs::create_dir(path.join(".local/env")).unwrap();
    json_write(&path.join(".local/env-owner.json"), &id).unwrap();
    fs_write(&path.join(".local/env/installed.txt"), "private");
    scheduler.fail_removal = true;
    assert!(lifecycle::uninstall_using(temp.path(), &record, &mut scheduler).is_err());
    assert_eq!(receipt(&record).unwrap().state, "uninstall_failed");
    assert!(path.join(".local/env/installed.txt").is_file());
    assert!(!path.join(".local/ready").exists());
    scheduler.fail_removal = false;
    lifecycle::uninstall_using(temp.path(), &record, &mut scheduler).unwrap();
    assert_eq!(receipt(&record).unwrap().state, "uninstalled");
    assert!(!path.join(".local/env").exists());
    assert!(path.join("README.md").is_file());
    assert_eq!(
        std::fs::read_to_string(project.join("keep")).unwrap(),
        "keep"
    );
    let calls = scheduler.calls.len();
    lifecycle::uninstall_using(temp.path(), &record, &mut scheduler).unwrap();
    assert_eq!(scheduler.calls.len(), calls);
}

#[test]
fn active_claim_prevents_uninstall_and_keeps_the_installed_task_usable() {
    let temp = tempfile::tempdir().unwrap();
    let id = lifecycle::create(temp.path(), draft(), Vec::new(), false).unwrap();
    let record = find(temp.path(), &id).unwrap();
    let mut scheduler = Scheduler::default();
    lifecycle::install_using(temp.path(), &record, &mut scheduler).unwrap();
    let path = directory(&record).unwrap();
    std::fs::create_dir(path.join(".local/run.claim")).unwrap();
    assert!(lifecycle::uninstall_using(temp.path(), &record, &mut scheduler).is_err());
    assert!(path.join(".local/ready").exists());
    assert_eq!(receipt(&record).unwrap().state, "installed");
    assert!(!scheduler.calls.iter().any(|call| call == "remove"));
}

#[test]
fn installed_packages_upload_as_discoverable_directories_and_restore_uninstalled_copies() {
    use crate::core::{auto_backup, backup_workspace, central_repo, skill_store::SkillStore};
    let _guard = central_repo::test_base_dir_lock();
    let temp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(temp.path().join("app")));
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
    let remote_path = temp.path().join("remote.git");
    let remote = git2::Repository::init_bare(&remote_path).unwrap();
    let repository = git2::Repository::open(backup_workspace::repo_dir()).unwrap();
    repository
        .remote("origin", remote_path.to_str().unwrap())
        .unwrap();
    let state = store::root();
    let mut definition = draft();
    definition.package_options = Some(PackageOptions {
        version: Some("1.2.3".into()),
        dependencies: vec![],
        hermes: None,
    });
    definition.enabled = true;
    definition.workdir = Some(temp.path().to_string_lossy().into_owned());
    let id = lifecycle::create(&state, definition, Vec::new(), false).unwrap();
    let original = find(&state, &id).unwrap();
    let local = directory(&original).unwrap();
    let mut scheduler = Scheduler::default();
    lifecycle::install_using(&state, &original, &mut scheduler).unwrap();
    fs_write(&local.join(".local/private.env"), "private-credentials");
    fs_write(&local.join(".local/output.log"), "private-execution-output");
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
    let relative = "automations/audit";
    assert!(tree
        .get_path(Path::new(&format!("{relative}/task.json")))
        .is_ok());
    assert!(tree
        .get_path(Path::new(&format!("{relative}/.local")))
        .is_err());
    assert!(tree
        .get_path(Path::new(&format!(
            ".agent-hub/automation-{}.json",
            id.trim_start_matches("agent_hub:")
        )))
        .is_err());
    let public = backup_workspace::repo_dir().join(relative);
    let preview = preview_package(&public).unwrap();
    assert_eq!(preview.version.as_deref(), Some("1.2.3"));
    let serialized = serde_json::to_string(&preview).unwrap();
    assert!(!serialized.contains("private-credentials"));
    assert!(!serialized.contains("private-execution-output"));
    assert!(!serialized.contains(&temp.path().to_string_lossy().to_string()));
    assert!(!preview.draft.enabled);
    let entry = super::super::native::shell_entry::entry(&original.draft).unwrap();
    fs_write(&local.join(&entry.path), "echo customized");
    assert_eq!(
        auto_backup::run_round_blocking(&db),
        auto_backup::Outcome::BackedUp
    );
    assert!(preview_package(&public)
        .unwrap()
        .draft
        .files
        .iter()
        .any(|f| f.content == "echo customized"));
    let restored = super::super::backup::restore(&id, true).unwrap();
    assert_ne!(restored.id, id);
    let copy = find(&state, &restored.id).unwrap();
    assert_eq!(receipt(&copy).unwrap().state, "uninstalled");
    assert_eq!(
        copy.draft
            .package_options
            .as_ref()
            .unwrap()
            .version
            .as_deref(),
        Some("1.2.3")
    );
    assert!(!copy.draft.enabled && copy.draft.workdir.is_none());
    assert_eq!(
        receipt(&find(&state, &id).unwrap()).unwrap().state,
        "installed"
    );
}

#[test]
fn task_versions_survive_import_edit_export_backup_and_restore_independently_of_revision() {
    use crate::core::central_repo;
    let _guard = central_repo::test_base_dir_lock();
    let temp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(temp.path().join("app")));
    struct Reset;
    impl Drop for Reset {
        fn drop(&mut self) {
            central_repo::set_test_base_dir_override(None);
        }
    }
    let _reset = Reset;
    let package: AutomationPackage = serde_json::from_value(serde_json::json!({
        "schema_version": 1, "version": "1.2.3", "shell": super::super::command_shell(),
        "draft": draft(), "dependencies": []
    }))
    .unwrap();
    let id = import_definition(package, None).unwrap();
    let state = store::root();
    let initial = find(&state, &id).unwrap();
    assert_eq!(initial.revision, 1);
    assert_eq!(
        initial
            .draft
            .package_options
            .as_ref()
            .unwrap()
            .version
            .as_deref(),
        Some("1.2.3")
    );
    let mut edited = initial.draft.clone();
    edited.schedule = Schedule::Hourly { minute: 15 };
    update::save(Some(&id), Some(initial.revision), edited).unwrap();
    let edited = find(&state, &id).unwrap();
    assert_eq!(edited.revision, 2);
    assert_eq!(
        edited
            .draft
            .package_options
            .as_ref()
            .unwrap()
            .version
            .as_deref(),
        Some("1.2.3")
    );
    let mut released = edited.draft.clone();
    released.package_options.as_mut().unwrap().version = Some("2.0.0-rc.1".into());
    update::save(Some(&id), Some(edited.revision), released).unwrap();
    let exported = temp.path().join("export.json");
    export_package(&id, &exported).unwrap();
    let preview = preview_package(&exported).unwrap();
    assert_eq!(preview.version.as_deref(), Some("2.0.0-rc.1"));
    assert_eq!(preview.schema_version, 1);
    let original = find(&state, &id).unwrap();
    let backup = super::super::backup::AutomationBackup {
        schema_version: 1,
        id: id.clone(),
        shell: super::super::command_shell().into(),
        draft: original.draft,
    };
    let cloud = temp.path().join("cloud-task");
    write_backup_directory(&backup, &cloud).unwrap();
    let restored = read_backup_directory(&cloud).unwrap();
    assert_eq!(
        restored
            .draft
            .package_options
            .as_ref()
            .unwrap()
            .version
            .as_deref(),
        Some("2.0.0-rc.1")
    );
    let restored_id = import_definition(preview_package(&cloud).unwrap(), None).unwrap();
    assert_ne!(id, restored_id);
    let restored = find(&state, &restored_id).unwrap();
    assert_eq!(restored.revision, 1);
    assert_eq!(receipt(&restored).unwrap().state, "uninstalled");
    assert_eq!(
        restored
            .draft
            .package_options
            .as_ref()
            .unwrap()
            .version
            .as_deref(),
        Some("2.0.0-rc.1")
    );
    let mut legacy: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(exported).unwrap()).unwrap();
    legacy.as_object_mut().unwrap().remove("version");
    let mut legacy: AutomationPackage = serde_json::from_value(legacy).unwrap();
    legacy.validate().unwrap();
    assert_eq!(legacy.version, None);
    for invalid in ["", "1.0", "v1.0.0", "latest", "1.0.0 "] {
        legacy.version = Some(invalid.into());
        assert!(
            legacy.validate().is_err(),
            "accepted invalid version {invalid}"
        );
    }
}
