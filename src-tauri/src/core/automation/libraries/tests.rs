use super::*;
use std::fs;
fn package() -> LibraryPackage {
    LibraryPackage {
        manifest: LibraryManifest {
            schema_version: 1,
            name: "platform".into(),
            version: "1.0.0".into(),
            files: vec!["__init__.py".into(), "client.py".into()],
        },
        files: vec![
            AutomationScriptFile {
                path: "__init__.py".into(),
                content: "from .client import identity\n".into(),
            },
            AutomationScriptFile {
                path: "client.py".into(),
                content: "identity = 'original'\n".into(),
            },
        ],
    }
}
#[test]
fn library_backup_round_trip_uses_declared_files_and_excludes_runtime() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("libraries");
    let source = root.join("platform");
    write(&source, &package()).unwrap();
    fs::create_dir(source.join(".local")).unwrap();
    fs::write(source.join(".local/token"), "private").unwrap();
    fs::write(source.join("unlisted.py"), "private").unwrap();
    let metadata = temp.path().join("metadata");
    backup::flush(&root, &metadata).unwrap();
    let repository = temp.path().join("repo");
    fs::create_dir(&repository).unwrap();
    super::super::backup::repository::export(&metadata, &repository).unwrap();
    let published = repository.join("automations/_shared/platform");
    assert!(published.join("client.py").exists());
    assert!(!published.join(".local").exists());
    assert!(!published.join("unlisted.py").exists());
    let restored = temp.path().join("restored");
    super::super::backup::repository::import(&repository, &restored).unwrap();
    assert_eq!(backup::read(&restored).unwrap()["platform"], package());
    assert!(super::super::backup::read(&restored).unwrap().is_empty());
}
#[test]
fn rejects_private_traversal_duplicates_and_linked_content() {
    let temp = tempfile::tempdir().unwrap();
    for name in [
        "../private.py",
        ".local/private.py",
        "a/.local/private.py",
        "C:private.py",
    ] {
        let mut value = package();
        value.manifest.files[1] = name.into();
        value.files[1].path = name.into();
        assert!(write(temp.path(), &value).is_err());
    }
    let mut value = package();
    value.manifest.files.push("client.py".into());
    assert!(write(temp.path(), &value).is_err());
    #[cfg(unix)]
    {
        write(temp.path(), &package()).unwrap();
        fs::remove_file(temp.path().join("client.py")).unwrap();
        let outside = temp.path().join("outside.py");
        fs::write(&outside, "secret").unwrap();
        std::os::unix::fs::symlink(outside, temp.path().join("client.py")).unwrap();
        assert!(read(temp.path()).is_err());
    }
}
#[test]
fn replacement_preserves_single_current_version_and_recovers_interruption() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    fs::create_dir(root.join(".local")).unwrap();
    storage::replace(root, &package()).unwrap();
    let mut changed = package();
    changed.manifest.version = "1.0.1".into();
    changed.files[1].content = "identity = 'updated'\n".into();
    storage::replace(root, &changed).unwrap();
    assert_eq!(read(&root.join("platform")).unwrap(), changed);
    assert!(!root.join(".local/previous/platform").exists());
    fs::rename(root.join("platform"), root.join(".local/previous/platform")).unwrap();
    store::write(
        &root.join(".local/operation-platform.json"),
        b"\"platform\"",
    )
    .unwrap();
    storage::recover(root, "platform").unwrap();
    assert_eq!(read(&root.join("platform")).unwrap(), changed);
}
#[test]
fn backup_retains_uninstalled_and_remote_updated_libraries_until_explicit_local_change() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("libraries");
    let metadata = temp.path().join("metadata");
    let remote = temp.path().join("remote/automations/_shared/platform");
    write(&remote, &package()).unwrap();
    backup::import(&temp.path().join("remote/automations"), &metadata).unwrap();
    backup::flush(&root, &metadata).unwrap();
    assert_eq!(backup::read(&metadata).unwrap()["platform"], package());
    write(&root.join("platform"), &package()).unwrap();
    backup::flush(&root, &metadata).unwrap();
    let mut newer = package();
    newer.manifest.version = "2.0.0".into();
    write(&remote, &newer).unwrap();
    backup::import(&temp.path().join("remote/automations"), &metadata).unwrap();
    backup::flush(&root, &metadata).unwrap();
    assert_eq!(backup::read(&metadata).unwrap()["platform"], newer);
    fs::remove_dir_all(root.join("platform")).unwrap();
    backup::flush(&root, &metadata).unwrap();
    assert!(backup::read(&metadata).unwrap().is_empty());
}
#[test]
fn escaped_content_round_trips_within_library_budget() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("libraries");
    let metadata = temp.path().join("metadata");
    let mut value = package();
    value.files[1].content = "\"".repeat(600_000);
    write(&root.join("platform"), &value).unwrap();
    backup::flush(&root, &metadata).unwrap();
    assert_eq!(backup::read(&metadata).unwrap()["platform"], value);
}
#[test]
#[cfg(unix)]
fn refuses_linked_library_storage_and_recovery_parents() {
    let temp = tempfile::tempdir().unwrap();
    let outside = temp.path().join("outside");
    fs::create_dir(&outside).unwrap();
    let root = temp.path().join("shared");
    fs::create_dir(&root).unwrap();
    std::os::unix::fs::symlink(&outside, root.join(".local")).unwrap();
    assert!(storage::lock(&root).is_err());
    fs::remove_file(root.join(".local")).unwrap();
    fs::create_dir(root.join(".local")).unwrap();
    std::os::unix::fs::symlink(&outside, root.join(".local/previous")).unwrap();
    assert!(storage::replace(&root, &package()).is_err());
    assert!(fs::read_dir(&outside).unwrap().next().is_none());
}
#[test]
fn python_loader_retains_an_inflight_snapshot_without_task_module_copies() {
    let python = crate::core::python_support::interpreter().unwrap();
    let temp = tempfile::tempdir().unwrap();
    let loader = temp.path().join("loader.py");
    let checks = temp.path().join("checks.py");
    fs::write(&loader, include_str!("loader.py")).unwrap();
    fs::write(&checks, include_str!("fixtures/loader_checks.py")).unwrap();
    let output = std::process::Command::new(python)
        .arg(checks)
        .arg(loader)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}
#[test]
#[cfg(feature = "cloud-sync")]
fn automatic_backup_publishes_library_content_and_preserves_runtime_exclusion() {
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
    fs::create_dir_all(central_repo::base_dir()).unwrap();
    let db = SkillStore::new(&central_repo::db_path()).unwrap();
    backup_workspace::initialize(&db).unwrap();
    let remote_path = temp.path().join("remote.git");
    let remote = git2::Repository::init_bare(&remote_path).unwrap();
    let repository = git2::Repository::open(backup_workspace::repo_dir()).unwrap();
    repository
        .remote("origin", remote_path.to_str().unwrap())
        .unwrap();
    write(&root().join("platform"), &package()).unwrap();
    fs::write(root().join("platform/private.py"), "never export").unwrap();
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
    assert!(tree
        .get_path(Path::new("automations/_shared/platform/client.py"))
        .is_ok());
    assert!(tree
        .get_path(Path::new("automations/_shared/platform/private.py"))
        .is_err());
    assert!(tree
        .get_path(Path::new("automations/_shared/.local"))
        .is_err());
    assert!(!backup::pending());
    let mut changed = package();
    changed.manifest.version = "1.0.1".into();
    changed.files[1].content = "identity = 'new'\n".into();
    write(&root().join("platform"), &changed).unwrap();
    assert!(backup::pending());
    assert_eq!(
        auto_backup::run_round_blocking(&db),
        auto_backup::Outcome::BackedUp
    );
    assert_eq!(
        backup::read(&crate::core::sync_metadata::metadata_dir()).unwrap()["platform"],
        changed
    );
}
#[test]
fn replacement_preserves_private_state_and_refuses_unknown_local_content() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    fs::create_dir(root.join(".local")).unwrap();
    storage::replace(root, &package()).unwrap();
    let target = root.join("platform");
    fs::write(target.join("unlisted.py"), "precious").unwrap();
    assert!(storage::replace(root, &package()).is_err());
    assert_eq!(
        fs::read_to_string(target.join("unlisted.py")).unwrap(),
        "precious"
    );
    fs::remove_file(target.join("unlisted.py")).unwrap();
    fs::create_dir(target.join(".local")).unwrap();
    fs::write(target.join(".local/private"), "keep").unwrap();
    storage::replace(root, &package()).unwrap();
    assert_eq!(
        fs::read_to_string(target.join(".local/private")).unwrap(),
        "keep"
    );
    assert!(storage::removable(&target).is_err());
}
#[test]
fn library_source_and_replacement_events_exclude_private_runtime() {
    let _guard = crate::core::central_repo::test_base_dir_lock();
    assert!(definition_event(&root().join("platform")));
    assert!(definition_event(&root().join("platform/client.py")));
    assert!(!definition_event(&root().join(".local/backup-index.json")));
    assert!(!definition_event(
        &root().join("platform/.local/cache.json")
    ));
}
#[test]
fn reading_portable_library_backups_never_creates_runtime_directories() {
    let temp = tempfile::tempdir().unwrap();
    let directory = temp.path().join("automations");
    write(&directory.join("_shared/platform"), &package()).unwrap();
    backup::import(&directory, &temp.path().join("metadata")).unwrap();
    assert!(!directory.join("_shared/.local").exists());
}
#[test]
fn revision_and_reference_guards_preserve_existing_libraries() {
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
    let source = temp.path().join("source");
    write(&source, &package()).unwrap();
    let installed = import(&source, None).unwrap();
    assert!(import(&source, Some("stale")).is_err());
    let id = format!("agent_hub:{}", uuid::Uuid::new_v4());
    let record = super::super::ManagedAutomation {
        id: id.clone(),
        revision: 1,
        source: super::super::native::source().into(),
        identifier: "org.example.library-test-no-job".into(),
        location: "fixture".into(),
        draft: super::super::AutomationDraft {
            name: "Library consumer".into(),
            description: None,
            provider: super::super::Provider::System,
            content: "echo fixture".into(),
            workdir: None,
            script_dir: None,
            files: vec![],
            package_options: Some(super::super::package::PackageOptions {
                version: Some("1.0.0".into()),
                dependencies: vec![Dependency::Library {
                    name: "platform".into(),
                }],
                hermes: None,
            }),
            enabled: false,
            schedule: super::super::Schedule::Manual,
        },
    };
    store::save(&store::root(), vec![record.clone()]).unwrap();
    assert!(remove("platform", &installed.revision).is_err());
    assert_eq!(
        import(&source, Some(&installed.revision))
            .unwrap()
            .dependents,
        vec![id]
    );
    let marker = super::super::native::directory(&store::root(), &record).join("run.claim");
    fs::create_dir_all(marker).unwrap();
    assert!(import(&source, Some(&installed.revision)).is_err());
    assert_eq!(
        resolve("platform", false).unwrap().revision,
        installed.revision
    );
    let metadata = crate::core::sync_metadata::metadata_dir();
    backup::flush(&root(), &metadata).unwrap();
    fs::remove_dir_all(root().join("platform")).unwrap();
    assert!(backup::flush(&root(), &metadata).is_err());
    assert!(backup::read(&metadata).unwrap().contains_key("platform"));
    let mut mismatched = package();
    mismatched.manifest.name = "different".into();
    write(&root().join("platform"), &mismatched).unwrap();
    assert!(resolve("platform", false).is_err());
}
#[test]
fn library_reads_wait_out_short_backup_lock_contention() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let held = storage::lock(root).unwrap();
    let release = std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(40));
        drop(held);
    });
    let next = storage::lock(root).unwrap();
    drop(next);
    release.join().unwrap();
}
