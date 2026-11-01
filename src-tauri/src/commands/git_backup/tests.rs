use super::*;

struct TestEnv {
    _lock: std::sync::MutexGuard<'static, ()>,
    _tmp: tempfile::TempDir,
    store: SkillStore,
    skills_dir: std::path::PathBuf,
}

impl Drop for TestEnv {
    fn drop(&mut self) {
        central_repo::set_test_base_dir_override(None);
    }
}

/// Isolated base dir (askpass script, skills repo, DB) + mock keyring.
fn test_env() -> TestEnv {
    git_credentials::use_mock_keyring();
    let lock = central_repo::test_base_dir_lock();
    let tmp = tempfile::tempdir().unwrap();
    let base = tmp.path().join("base");
    central_repo::set_test_base_dir_override(Some(base.clone()));
    let skills_dir = central_repo::skills_dir();
    std::fs::create_dir_all(&skills_dir).unwrap();
    let store = SkillStore::new(&base.join("test.db")).unwrap();
    TestEnv {
        _lock: lock,
        _tmp: tmp,
        store,
        skills_dir,
    }
}

fn git(dir: &Path, args: &[&str]) {
    let out = std::process::Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

fn origin_url(dir: &Path) -> String {
    let out = std::process::Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(["remote", "get-url", "origin"])
        .output()
        .unwrap();
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

#[test]
fn restored_metadata_keeps_local_only_skills_even_when_remote_snapshot_is_empty() {
    let env = test_env();
    sync_metadata::write_all_from_db_unlocked(&env.store).unwrap();
    let local = env.skills_dir.join("local-only");
    std::fs::create_dir_all(&local).unwrap();
    std::fs::write(local.join("SKILL.md"), "# Local only").unwrap();
    reconcile_skills_index_unlocked(&env.store).unwrap();
    let skills = env.store.get_all_skills().unwrap();
    assert_eq!(skills.len(), 1);
    let id = skills[0].id.clone();
    let additional = env.skills_dir.join("another-local");
    std::fs::create_dir_all(&additional).unwrap();
    std::fs::write(additional.join("SKILL.md"), "# Another local").unwrap();
    reconcile_skills_index_unlocked(&env.store).unwrap();
    let skills = env.store.get_all_skills().unwrap();
    assert_eq!(skills.len(), 2);
    assert!(skills.iter().any(|skill| skill.id == id));
    sync_metadata::reindex_from_metadata_unlocked(&env.store).unwrap();
    assert_eq!(env.store.get_all_skills().unwrap().len(), 2);
    assert!(local.join("SKILL.md").is_file());
}

#[test]
fn device_name_default_persists_and_rename_updates_repo_config() {
    let env = test_env();
    // First resolve derives a hostname default and persists it, so the
    // name stays stable even if the hostname later changes.
    let name = effective_device_name(&env.store);
    assert!(!name.is_empty());
    assert_eq!(
        env.store
            .get_setting("backup_device_name")
            .unwrap()
            .as_deref(),
        Some(name.as_str())
    );

    // With a repo present, a rename rewrites the repo-local identity used
    // for all future commits (§4.3).
    git(&env.skills_dir, &["init", "-b", "main"]);
    env.store
        .set_setting("backup_device_name", "Work Laptop")
        .unwrap();
    apply_device_identity(&env.store, &env.skills_dir);
    let user_name = std::process::Command::new("git")
        .arg("-C")
        .arg(&env.skills_dir)
        .args(["config", "--local", "--get", "user.name"])
        .output()
        .unwrap();
    assert_eq!(
        String::from_utf8_lossy(&user_name.stdout).trim(),
        "Work Laptop"
    );
}

#[test]
fn sync_transaction_commits_merges_and_pushes_in_one_call() {
    let env = test_env();
    // Local repo wired to a bare remote.
    let remote = env._tmp.path().join("remote.git");
    assert!(std::process::Command::new("git")
        .args(["init", "--bare", "--initial-branch=main"])
        .arg(&remote)
        .output()
        .unwrap()
        .status
        .success());
    crate::core::git_backup::init_repo_unlocked(&env.skills_dir, "Device A").unwrap();
    crate::core::git_backup::set_remote_unlocked(&env.skills_dir, remote.to_str().unwrap())
        .unwrap();
    crate::core::git_backup::push_unlocked(&env.skills_dir).unwrap();

    // Another device clones and pushes a change (with protocol markers).
    let other = env._tmp.path().join("other");
    assert!(std::process::Command::new("git")
        .arg("clone")
        .arg(&remote)
        .arg(&other)
        .output()
        .unwrap()
        .status
        .success());
    crate::core::git_backup::configure_device_identity(&other, "Device B").unwrap();
    std::fs::write(other.join("from-b.md"), "b").unwrap();
    crate::core::git_backup::commit_all_unlocked(&other, "from B").unwrap();
    git(&other, &["push", "origin", "main"]);

    // Local uncommitted edit + being behind: one sync call must commit,
    // merge, snapshot and push — no separate commit/pull/push round trips.
    std::fs::write(env.skills_dir.join("local.md"), "a").unwrap();
    let outcome = run_sync_blocking(&env.store, &env.skills_dir, "backup").unwrap();
    assert!(outcome.committed);
    assert!(outcome.merge.is_some(), "a merge must have run");
    assert!(outcome.pushed);
    assert!(outcome.snapshot_tag.is_some());

    // Remote now holds the merged state with both files.
    let remote_head = {
        let out = std::process::Command::new("git")
            .arg("-C")
            .arg(&remote)
            .args(["rev-parse", "main"])
            .output()
            .unwrap();
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    };
    let local_head = {
        let out = std::process::Command::new("git")
            .arg("-C")
            .arg(&env.skills_dir)
            .args(["rev-parse", "HEAD"])
            .output()
            .unwrap();
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    };
    assert_eq!(remote_head, local_head);
    assert!(env.skills_dir.join("from-b.md").exists());
    assert!(env.skills_dir.join("local.md").exists());

    // A second sync with nothing new is a full no-op.
    let quiet = run_sync_blocking(&env.store, &env.skills_dir, "backup").unwrap();
    assert!(!quiet.committed);
    assert!(quiet.merge.is_none());
    assert!(!quiet.pushed);
    assert!(quiet.snapshot_tag.is_none());
}

#[test]
fn migrate_is_noop_without_embedded_credentials() {
    let env = test_env();
    git(&env.skills_dir, &["init", "-b", "main"]);
    git(
        &env.skills_dir,
        &[
            "remote",
            "add",
            "origin",
            "https://github.com/acme/repo.git",
        ],
    );
    env.store
        .set_setting("git_backup_remote_url", "https://github.com/acme/repo.git")
        .unwrap();

    let result = migrate_embedded_credentials_unlocked(&env.store, &env.skills_dir).unwrap();
    assert_eq!(result, None);
    assert_eq!(
        origin_url(&env.skills_dir),
        "https://github.com/acme/repo.git"
    );
}

#[test]
fn disconnect_clears_origin_and_setting_and_is_idempotent() {
    // #260 acceptance: after "disconnect this machine" neither the git
    // origin nor the saved setting may survive, so nothing can backfill
    // the URL when the settings page reopens.
    let env = test_env();
    git(&env.skills_dir, &["init", "-b", "main"]);
    git(
        &env.skills_dir,
        &[
            "remote",
            "add",
            "origin",
            "https://github.com/acme/repo.git",
        ],
    );
    env.store
        .set_setting("git_backup_remote_url", "https://github.com/acme/repo.git")
        .unwrap();

    disconnect_local(&env.store, &env.skills_dir).unwrap();
    assert_eq!(origin_url(&env.skills_dir), "");
    assert_eq!(
        env.store
            .get_setting("git_backup_remote_url")
            .unwrap()
            .as_deref(),
        Some("")
    );

    // A second disconnect (nothing left to remove) must still succeed.
    disconnect_local(&env.store, &env.skills_dir).unwrap();
}

#[test]
fn migrate_sanitizes_setting_when_no_repo_exists() {
    let env = test_env();
    // Only the saved setting carries a token (repo not initialized yet):
    // the token moves to the credential store and the setting is rewritten, with
    // no network verification possible or needed.
    env.store
        .set_setting(
            "git_backup_remote_url",
            "https://user:tok@github.com/acme/repo.git",
        )
        .unwrap();

    let result = migrate_embedded_credentials_unlocked(&env.store, &env.skills_dir).unwrap();
    assert_eq!(result.as_deref(), Some("https://github.com/acme/repo.git"));
    assert_eq!(
        env.store
            .get_setting("git_backup_remote_url")
            .unwrap()
            .as_deref(),
        Some("https://github.com/acme/repo.git")
    );
}

#[test]
fn migrate_rolls_back_config_and_setting_on_verify_failure() {
    let env = test_env();
    // Unreachable host: verification must fail after the config rewrite,
    // and the rollback must restore the exact original state (§3.7 —
    // no half-migrated state).
    let token_url = "https://user:sometok@127.0.0.1:1/acme/repo.git";
    git(&env.skills_dir, &["init", "-b", "main"]);
    git(&env.skills_dir, &["remote", "add", "origin", token_url]);
    env.store
        .set_setting("git_backup_remote_url", token_url)
        .unwrap();

    let err = migrate_embedded_credentials_unlocked(&env.store, &env.skills_dir).unwrap_err();
    let msg = format!("{err:#}");
    assert!(
        msg.contains("verification failed"),
        "unexpected error: {msg}"
    );
    assert!(
        !msg.contains("sometok"),
        "token must not leak into the error: {msg}"
    );
    assert_eq!(origin_url(&env.skills_dir), token_url);
    assert_eq!(
        env.store
            .get_setting("git_backup_remote_url")
            .unwrap()
            .as_deref(),
        Some(token_url)
    );
}
