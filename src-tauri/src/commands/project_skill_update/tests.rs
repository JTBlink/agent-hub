use super::restore_from_center;
use crate::core::{
    central_repo, content_hash,
    error::ErrorKind,
    project_library,
    skill_store::{ProjectRecord, SkillRecord, SkillStore},
    tool_adapters,
};
use std::{
    fs,
    path::PathBuf,
    time::{Duration, SystemTime},
};

struct Fixture {
    directory: tempfile::TempDir,
    store: SkillStore,
    project: PathBuf,
    source: PathBuf,
    target: PathBuf,
    _guard: std::sync::MutexGuard<'static, ()>,
}
impl Fixture {
    fn new(linked: bool, managed: bool) -> Self {
        let guard = central_repo::test_base_dir_lock();
        let directory = tempfile::tempdir().unwrap();
        central_repo::set_test_base_dir_override(Some(directory.path().join("state")));
        let store = SkillStore::new(&directory.path().join("fixture.db")).unwrap();
        let project = directory.path().join("project");
        let source = directory.path().join("center").join("demo");
        let target = if linked {
            project.join("demo")
        } else {
            project.join(".codex").join("skills").join("demo")
        };
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(
            source.join("SKILL.md"),
            "---\nname: demo\ndescription: Fixture skill\n---\nCenter version\n",
        )
        .unwrap();
        let skill = SkillRecord {
            id: "demo-id".into(),
            name: "demo".into(),
            description: None,
            source_type: "local".into(),
            source_ref: None,
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            source_agent: None,
            remote_revision: None,
            central_path: source.to_string_lossy().into(),
            content_hash: Some(content_hash::hash_directory(&source).unwrap()),
            enabled: true,
            created_at: 0,
            updated_at: 0,
            status: "ok".into(),
            update_status: "local_only".into(),
            last_checked_at: None,
            last_check_error: None,
        };
        store.insert_skill(&skill).unwrap();
        store
            .insert_project(&ProjectRecord {
                id: "project".into(),
                name: "Demo workspace".into(),
                path: project.to_string_lossy().into(),
                workspace_type: if linked { "linked" } else { "project" }.into(),
                linked_agent_key: linked.then(|| "codex".into()),
                linked_agent_name: linked.then(|| "Codex".into()),
                disabled_path: None,
                sort_order: 0,
                created_at: 0,
                updated_at: 0,
            })
            .unwrap();
        if managed {
            fs::remove_dir_all(&target).unwrap();
            project_library::install_with_mode(
                &project,
                &skill,
                &[tool_adapters::find_adapter("codex").unwrap()],
                true,
            )
            .unwrap();
        }
        fs::write(
            target.join("SKILL.md"),
            "---\nname: demo\ndescription: Fixture skill\n---\nProject version\n",
        )
        .unwrap();
        for (file, seconds) in [
            (source.join("SKILL.md"), 100),
            (target.join("SKILL.md"), 300),
        ] {
            // Windows requires write access when setting file timestamps.
            fs::OpenOptions::new()
                .write(true)
                .open(file)
                .unwrap()
                .set_times(
                    fs::FileTimes::new()
                        .set_modified(SystemTime::UNIX_EPOCH + Duration::from_secs(seconds)),
                )
                .unwrap();
        }
        Self {
            directory,
            store,
            project,
            source,
            target,
            _guard: guard,
        }
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        central_repo::set_test_base_dir_override(None);
    }
}

#[test]
fn newer_plain_and_linked_project_copies_require_consent_and_restore_after_confirmation() {
    for linked in [false, true] {
        let fixture = Fixture::new(linked, false);
        let before = fs::read(fixture.target.join("SKILL.md")).unwrap();
        let error =
            restore_from_center(&fixture.store, "project", "demo", "codex", false).unwrap_err();
        assert_eq!(error.kind, ErrorKind::ProjectRestoreRequired);
        assert_eq!(
            serde_json::to_value(&error).unwrap()["kind"],
            "project_restore_required"
        );
        assert_eq!(
            error.message,
            "Project skill is newer than the Skills Center version"
        );
        assert_eq!(fs::read(fixture.target.join("SKILL.md")).unwrap(), before);
        restore_from_center(&fixture.store, "project", "demo", "codex", true).unwrap();
        assert_eq!(
            fs::read(fixture.target.join("SKILL.md")).unwrap(),
            fs::read(fixture.source.join("SKILL.md")).unwrap()
        );
        assert!(!fixture.target.is_symlink());
    }
}

#[test]
fn managed_project_command_keeps_default_protection_and_passes_explicit_force_to_transaction() {
    let fixture = Fixture::new(false, true);
    let error = restore_from_center(&fixture.store, "project", "demo", "codex", false).unwrap_err();
    assert_eq!(error.kind, ErrorKind::ProjectRestoreRequired);
    restore_from_center(&fixture.store, "project", "demo", "codex", true).unwrap();
    let canonical = fixture
        .project
        .join(".agents")
        .join("skills")
        .join("demo")
        .join("SKILL.md");
    assert_eq!(
        fs::read(canonical).unwrap(),
        fs::read(fixture.target.join("SKILL.md")).unwrap()
    );
}

#[test]
fn forced_command_still_rejects_path_traversal() {
    let fixture = Fixture::new(true, false);
    let before = fs::read(fixture.source.join("SKILL.md")).unwrap();
    assert!(
        restore_from_center(&fixture.store, "project", "../center/demo", "codex", true).is_err()
    );
    assert_eq!(fs::read(fixture.source.join("SKILL.md")).unwrap(), before);
    assert!(fixture.directory.path().exists());
}

#[test]
fn invalid_center_version_does_not_erase_the_project_copy() {
    let fixture = Fixture::new(false, false);
    fixture
        .store
        .set_setting("project_sync_mode", "copy")
        .unwrap();
    fs::remove_file(fixture.source.join("SKILL.md")).unwrap();
    let before = fs::read(fixture.target.join("SKILL.md")).unwrap();
    let result = restore_from_center(&fixture.store, "project", "demo", "codex", true);
    assert!(
        result.is_err(),
        "an empty center directory must not replace a project Skill"
    );
    assert_eq!(fs::read(fixture.target.join("SKILL.md")).unwrap(), before);
}

#[cfg(unix)]
#[test]
fn failed_confirmed_restore_keeps_local_files_for_retry() {
    let fixture = Fixture::new(false, false);
    fixture
        .store
        .set_setting("project_sync_mode", "copy")
        .unwrap();
    let before = fs::read(fixture.target.join("SKILL.md")).unwrap();
    fs::write(fixture.target.join("local.txt"), "local content").unwrap();
    std::os::unix::fs::symlink(
        fixture.source.join("missing.txt"),
        fixture.source.join("broken.txt"),
    )
    .unwrap();
    assert!(restore_from_center(&fixture.store, "project", "demo", "codex", true).is_err());
    assert_eq!(fs::read(fixture.target.join("SKILL.md")).unwrap(), before);
    assert_eq!(
        fs::read_to_string(fixture.target.join("local.txt")).unwrap(),
        "local content"
    );
    fs::remove_file(fixture.source.join("broken.txt")).unwrap();
    restore_from_center(&fixture.store, "project", "demo", "codex", true).unwrap();
    assert_eq!(
        fs::read(fixture.target.join("SKILL.md")).unwrap(),
        fs::read(fixture.source.join("SKILL.md")).unwrap()
    );
    assert!(!fixture.target.join("local.txt").exists());
}
