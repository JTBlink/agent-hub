use super::*;
use std::process::Command;

struct Env {
    _lock: std::sync::MutexGuard<'static, ()>,
    tmp: tempfile::TempDir,
    store: SkillStore,
    live: PathBuf,
}
impl Drop for Env {
    fn drop(&mut self) {
        central_repo::set_test_base_dir_override(None);
    }
}
fn env() -> Env {
    let lock = central_repo::test_base_dir_lock();
    let tmp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(tmp.path().join("app")));
    let live = central_repo::skills_dir();
    fs::create_dir_all(&live).unwrap();
    let store = SkillStore::new(&central_repo::db_path()).unwrap();
    Env {
        _lock: lock,
        tmp,
        store,
        live,
    }
}
fn skill(root: &Path, name: &str, content: &str) {
    fs::create_dir_all(root.join(name)).unwrap();
    fs::write(
        root.join(name).join("SKILL.md"),
        format!("---\nname: {name}\ndescription: Fixture skill\n---\n{content}\n"),
    )
    .unwrap();
}
fn git(root: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).unwrap().trim().to_string()
}

#[test]
fn migrates_history_and_exports_installable_skills_without_moving_live_content() {
    let e = env();
    skill(&e.live, "demo", "original");
    git_backup::init_repo_unlocked(&e.live, "Fixture Device").unwrap();
    let old = git(&e.live, &["rev-parse", "HEAD"]);
    initialize(&e.store).unwrap();
    let root = repo_dir();
    assert!(root.join("skills/demo/SKILL.md").is_file());
    assert!(root.join("README.md").is_file());
    assert_eq!(git(&e.live, &["rev-parse", "HEAD"]), old);
    git(&root, &["merge-base", "--is-ancestor", &old, "HEAD"]);
    let metadata = read_metadata(&root.join(".agent-hub/skills")).unwrap();
    assert_eq!(metadata[0].1.path, "skills/demo");
    assert_eq!(
        read_metadata(&e.live.join(".agent-hub/skills")).unwrap()[0]
            .1
            .path,
        "demo"
    );
    assert_eq!(
        e.store.get_all_skills().unwrap()[0].central_path,
        e.live.join("demo").to_string_lossy()
    );
}

#[test]
fn restores_a_flat_snapshot_created_before_the_layout_migration() {
    let e = env();
    skill(&e.live, "demo", "old snapshot");
    super::super::shared_skill_index::register_missing(&e.store).unwrap();
    sync_metadata::write_all_from_db_unlocked(&e.store).unwrap();
    git_backup::init_repo_unlocked(&e.live, "Fixture Device").unwrap();
    let tag = git_backup::create_snapshot_tag_unlocked(&e.live).unwrap();
    initialize(&e.store).unwrap();
    skill(&e.live, "demo", "new snapshot");
    commit(&e.store, "new content").unwrap();
    restore(&e.store, &tag).unwrap();
    assert!(fs::read_to_string(e.live.join("demo/SKILL.md"))
        .unwrap()
        .contains("old snapshot"));
    assert!(repo_dir().join("skills/demo/SKILL.md").is_file());
    assert_eq!(
        read_metadata(&repo_dir().join(".agent-hub/skills")).unwrap()[0]
            .1
            .path,
        "skills/demo"
    );
}

#[test]
fn snapshot_restores_live_content_and_keeps_originals() {
    let e = env();
    skill(&e.live, "demo", "before");
    initialize(&e.store).unwrap();
    let tag = commit(&e.store, "first").unwrap();
    skill(&e.live, "demo", "after");
    commit(&e.store, "second").unwrap();
    restore(&e.store, &tag).unwrap();
    assert!(fs::read_to_string(e.live.join("demo/SKILL.md"))
        .unwrap()
        .contains("before"));
    let recovery = central_repo::base_dir().join("recovery");
    assert!(fs::read_dir(recovery).unwrap().any(|entry| {
        fs::read_to_string(entry.unwrap().path().join("demo/SKILL.md"))
            .is_ok_and(|s| s.contains("after"))
    }));
}

#[test]
fn sync_publishes_remote_changes_and_preserves_live_only_files() {
    let e = env();
    skill(&e.live, "demo", "base");
    initialize(&e.store).unwrap();
    let remote = e.tmp.path().join("remote.git");
    fs::create_dir(&remote).unwrap();
    git(&remote, &["init", "--bare", "--initial-branch=main"]);
    git_backup::set_remote(&repo_dir(), remote.to_str().unwrap()).unwrap();
    git_backup::push(&repo_dir()).unwrap();
    let other = e.tmp.path().join("other");
    git(
        e.tmp.path(),
        &["clone", remote.to_str().unwrap(), other.to_str().unwrap()],
    );
    git_backup::configure_device_identity(&other, "Other Device").unwrap();
    skill(&other.join("skills"), "demo", "remote");
    skill(&other.join("skills"), "added", "new");
    git_backup::commit_all(&other, "remote edit").unwrap();
    git_backup::push(&other).unwrap();
    skill(&e.live, "local", "local only");
    pull(&e.store).unwrap();
    assert!(fs::read_to_string(e.live.join("demo/SKILL.md"))
        .unwrap()
        .contains("remote"));
    assert!(e.live.join("local/SKILL.md").is_file());
    assert!(e.live.join("added/SKILL.md").is_file());
    assert!(!journal_path().exists());
}

#[test]
fn concurrent_external_edit_is_not_overwritten_and_publication_can_resume() {
    let e = env();
    skill(&e.live, "demo", "base");
    initialize(&e.store).unwrap();
    prepare_unlocked(&e.store).unwrap();
    skill(&repo_dir().join("skills"), "demo", "remote");
    skill(&e.live, "demo", "external edit");
    assert!(finish_unlocked(&e.store).is_err());
    assert!(journal_path().exists());
    assert!(fs::read_to_string(e.live.join("demo/SKILL.md"))
        .unwrap()
        .contains("external edit"));
    skill(&e.live, "demo", "base");
    finish_unlocked(&e.store).unwrap();
    assert!(fs::read_to_string(e.live.join("demo/SKILL.md"))
        .unwrap()
        .contains("remote"));
}

#[test]
fn failed_network_clone_leaves_live_and_history_untouched() {
    let e = env();
    skill(&e.live, "demo", "base");
    initialize(&e.store).unwrap();
    let before = git(&repo_dir(), &["rev-parse", "HEAD"]);
    assert!(clone_repo(
        &e.store,
        e.tmp.path().join("missing").to_str().unwrap(),
        false
    )
    .is_err());
    assert_eq!(git(&repo_dir(), &["rev-parse", "HEAD"]), before);
    assert!(fs::read_to_string(e.live.join("demo/SKILL.md"))
        .unwrap()
        .contains("base"));
    assert!(!journal_path().exists());
}

#[test]
fn status_refresh_does_not_rewrite_live_metadata_or_unchanged_backup_skills() {
    let e = env();
    skill(&e.live, "demo", "base");
    initialize(&e.store).unwrap();
    let source = e.live.join(".agent-hub/schema.json");
    let backup = repo_dir().join("skills/demo/SKILL.md");
    let source_time = fs::metadata(&source).unwrap().modified().unwrap();
    let backup_time = fs::metadata(&backup).unwrap().modified().unwrap();
    status(&e.store).unwrap();
    status(&e.store).unwrap();
    assert_eq!(
        fs::metadata(source).unwrap().modified().unwrap(),
        source_time
    );
    assert_eq!(
        fs::metadata(backup).unwrap().modified().unwrap(),
        backup_time
    );
}

#[test]
fn clone_accepts_standard_nested_and_legacy_flat_repositories() {
    let e = env();
    for nested in [false, true] {
        let remote = e.tmp.path().join(if nested { "nested" } else { "flat" });
        fs::create_dir(&remote).unwrap();
        skill(
            &if nested {
                remote.join("skills")
            } else {
                remote.clone()
            },
            "demo",
            "remote",
        );
        git_backup::init_repo_unlocked(&remote, "Fixture Device").unwrap();
        skill(&e.live, "local", "local only");
        clone_repo(&e.store, remote.to_str().unwrap(), false).unwrap();
        assert!(e.live.join("demo/SKILL.md").is_file());
        assert!(e.live.join("local/SKILL.md").is_file());
        assert!(!e.live.join("skills/demo/SKILL.md").exists());
    }
}

#[cfg(unix)]
#[test]
fn exported_linked_skills_are_portable_and_live_links_stay_intact() {
    let e = env();
    skill(e.tmp.path(), "external", "linked");
    std::os::unix::fs::symlink(e.tmp.path().join("external"), e.live.join("linked")).unwrap();
    initialize(&e.store).unwrap();
    assert!(e.live.join("linked").is_symlink());
    assert!(!repo_dir().join("skills/linked").is_symlink());
    assert!(repo_dir().join("skills/linked/SKILL.md").is_file());
}

#[test]
fn backup_excludes_credentials_and_nested_git_and_applies_skill_deletion() {
    let e = env();
    skill(&e.live, "demo", "base");
    fs::create_dir_all(e.live.join("credentials")).unwrap();
    fs::write(
        e.live.join("credentials/fixture.json"),
        "fixture credential",
    )
    .unwrap();
    fs::create_dir_all(e.live.join("demo/.git")).unwrap();
    fs::write(e.live.join("demo/.git/config"), "fixture config").unwrap();
    initialize(&e.store).unwrap();
    assert!(!repo_dir().join("skills/credentials").exists());
    assert!(!repo_dir().join("skills/demo/.git").exists());
    prepare_unlocked(&e.store).unwrap();
    fs::remove_dir_all(repo_dir().join("skills/demo")).unwrap();
    for (path, _) in read_metadata(&repo_dir().join(".agent-hub/skills")).unwrap() {
        fs::remove_file(path).unwrap();
    }
    finish_unlocked(&e.store).unwrap();
    assert!(!e.live.join("demo").exists());
    assert!(e.live.join("credentials/fixture.json").exists());
    assert!(e.store.get_all_skills().unwrap().is_empty());
}

#[cfg(unix)]
#[test]
fn restore_rejects_remote_symlinks_without_changing_live_skill() {
    let e = env();
    skill(&e.live, "demo", "base");
    initialize(&e.store).unwrap();
    prepare_unlocked(&e.store).unwrap();
    let outside = e.tmp.path().join("outside");
    fs::write(&outside, "external fixture").unwrap();
    std::os::unix::fs::symlink(outside, repo_dir().join("skills/demo/linked")).unwrap();
    assert!(finish_unlocked(&e.store).is_err());
    assert!(!e.live.join("demo/linked").exists());
    assert!(fs::read_to_string(e.live.join("demo/SKILL.md"))
        .unwrap()
        .contains("base"));
}

#[test]
fn backs_up_and_restores_user_configuration_without_applying_system_hosts() {
    let e = env();
    let profile =
        super::super::hosts::profiles::create("Development", "127.0.0.1 localhost\n").unwrap();
    initialize(&e.store).unwrap();
    let root = repo_dir();
    assert_eq!(
        fs::read_to_string(root.join(format!("user-config/hosts/{}.hosts", profile.id))).unwrap(),
        "127.0.0.1 localhost\n"
    );
    let tag = commit(&e.store, "before profile change").unwrap();
    super::super::hosts::profiles::update(
        &profile.id,
        "Changed",
        "::1 localhost\n",
        &profile.revision,
    )
    .unwrap();
    commit(&e.store, "after profile change").unwrap();
    restore(&e.store, &tag).unwrap();
    let restored = super::super::hosts::profiles::list().unwrap();
    assert_eq!(restored[0].name, "Development");
    assert_eq!(restored[0].content, "127.0.0.1 localhost\n");
    assert!(!e.tmp.path().join("hosts").exists());
}

#[test]
fn preserves_external_configuration_edits_when_remote_publication_conflicts() {
    let e = env();
    let profile = super::super::hosts::profiles::create("Original", "# original\n").unwrap();
    initialize(&e.store).unwrap();
    prepare_unlocked(&e.store).unwrap();
    fs::write(
        repo_dir().join(format!("user-config/hosts/{}.hosts", profile.id)),
        "# incoming\n",
    )
    .unwrap();
    fs::write(&profile.path, "# external\n").unwrap();
    assert!(super::super::hosts::profiles::list().is_err());
    assert!(journal_path().exists());
    assert!(finish_unlocked(&e.store).is_err());
    assert_eq!(fs::read_to_string(&profile.path).unwrap(), "# external\n");
    fs::write(&profile.path, "# original\n").unwrap();
    finish_unlocked(&e.store).unwrap();
    assert_eq!(fs::read_to_string(&profile.path).unwrap(), "# incoming\n");
}

#[cfg(unix)]
#[test]
fn rejects_linked_configuration_before_publishing_any_restore() {
    let e = env();
    let profile = super::super::hosts::profiles::create("Original", "# original\n").unwrap();
    initialize(&e.store).unwrap();
    prepare_unlocked(&e.store).unwrap();
    let remote = repo_dir().join(format!("user-config/hosts/{}.hosts", profile.id));
    fs::remove_file(&remote).unwrap();
    let outside = e.tmp.path().join("private");
    fs::write(&outside, "# outside\n").unwrap();
    std::os::unix::fs::symlink(&outside, remote).unwrap();
    assert!(finish_unlocked(&e.store).is_err());
    assert_eq!(fs::read_to_string(&profile.path).unwrap(), "# original\n");
    assert_eq!(fs::read_to_string(outside).unwrap(), "# outside\n");
}

#[test]
fn configuration_writers_wait_for_interrupted_restore_recovery() {
    let e = env();
    let profile = super::super::hosts::profiles::create("Original", "# original\n").unwrap();
    initialize(&e.store).unwrap();
    prepare_unlocked(&e.store).unwrap();
    fs::write(
        repo_dir().join(format!("user-config/hosts/{}.hosts", profile.id)),
        "# incoming\n",
    )
    .unwrap();
    let journal: Journal = serde_json::from_slice(&fs::read(journal_path()).unwrap()).unwrap();
    fs::create_dir_all(&journal.recovery).unwrap();
    fs::rename(
        super::super::user_config::root(),
        journal.recovery.join("user-config"),
    )
    .unwrap();
    assert_eq!(
        super::super::user_config::ensure_root().unwrap_err(),
        "USER_CONFIG_RECOVERY_PENDING"
    );
    assert!(!super::super::user_config::root().exists());
    finish_unlocked(&e.store).unwrap();
    assert_eq!(
        super::super::hosts::profiles::list().unwrap()[0].content,
        "# incoming\n"
    );
}

#[test]
fn restores_both_legacy_hosts_layouts_and_migrates_them_to_flat_files() {
    for nested in [false, true] {
        let e = env();
        let profile = super::super::hosts::profiles::create("Original", "# original\n").unwrap();
        initialize(&e.store).unwrap();
        prepare_unlocked(&e.store).unwrap();
        let root = repo_dir().join("user-config/hosts");
        let legacy = if nested {
            root.join("profiles")
        } else {
            root.clone()
        }
        .join(&profile.id);
        fs::create_dir_all(&legacy).unwrap();
        fs::rename(
            root.join(format!("{}.hosts", profile.id)),
            legacy.join("hosts"),
        )
        .unwrap();
        fs::rename(
            root.join(format!("{}.json", profile.id)),
            legacy.join("profile.json"),
        )
        .unwrap();
        finish_unlocked(&e.store).unwrap();
        let restored = super::super::hosts::profiles::list().unwrap().remove(0);
        assert_eq!(restored.id, profile.id);
        assert_eq!(restored.revision, profile.revision);
        assert_eq!(restored.content, profile.content);
        assert_eq!(restored.path, profile.path);
        assert!(!super::super::user_config::root()
            .join("hosts/profiles")
            .exists());
    }
}

#[test]
fn hosts_reads_finish_pending_configuration_recovery_without_restarting() {
    let e = env();
    let profile = super::super::hosts::profiles::create("Original", "# original\n").unwrap();
    initialize(&e.store).unwrap();
    prepare_unlocked(&e.store).unwrap();
    fs::write(
        repo_dir().join(format!("user-config/hosts/{}.hosts", profile.id)),
        "# incoming\n",
    )
    .unwrap();
    assert!(journal_path().exists());
    let restored = super::super::hosts::profiles::list().unwrap();
    assert_eq!(restored[0].content, "# incoming\n");
    assert!(!journal_path().exists());
    assert_eq!(
        super::super::hosts::profiles::list().unwrap()[0].id,
        profile.id
    );
}
