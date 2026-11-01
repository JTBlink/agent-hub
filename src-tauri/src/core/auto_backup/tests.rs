use super::*;
use std::path::Path;

// ── is_due (pure debounce/backoff decision) ──

const MIN2: i64 = 120_000;

#[test]
fn not_due_without_pending_change() {
    assert!(!is_due(false, 0, MIN2 * 10, 0));
}

#[test]
fn due_after_quiet_period() {
    assert!(!is_due(true, 1_000_000, 1_000_000 + MIN2 - 1, 0));
    assert!(is_due(true, 1_000_000, 1_000_000 + MIN2, 0));
}

#[test]
fn failures_stretch_the_quiet_period_with_a_cap() {
    let base = 1_000_000;
    assert!(!is_due(true, base, base + MIN2, 1));
    assert!(is_due(true, base, base + 2 * MIN2, 1));
    // Backoff is capped at 2^5 — an hour-ish, never unbounded.
    assert!(is_due(true, base, base + 32 * MIN2, 40));
    assert!(!is_due(true, base, base + 31 * MIN2, 40));
}

// ── round behaviour against a local bare remote ──

struct TestEnv {
    _lock: std::sync::MutexGuard<'static, ()>,
    _tmp: tempfile::TempDir,
    store: Arc<SkillStore>,
    skills_dir: std::path::PathBuf,
    repo_dir: std::path::PathBuf,
    remote: std::path::PathBuf,
}

impl Drop for TestEnv {
    fn drop(&mut self) {
        central_repo::set_test_base_dir_override(None);
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

fn git_out(dir: &Path, args: &[&str]) -> String {
    let out = std::process::Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .unwrap();
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

/// Skills repo (one commit, upstream tracking) + local bare remote.
fn test_env() -> TestEnv {
    let lock = central_repo::test_base_dir_lock();
    let tmp = tempfile::tempdir().unwrap();
    let base = tmp.path().join("base");
    central_repo::set_test_base_dir_override(Some(base.clone()));
    let skills_dir = central_repo::skills_dir();
    std::fs::create_dir_all(&skills_dir).unwrap();
    let store = Arc::new(SkillStore::new(&base.join("test.db")).unwrap());

    let remote = tmp.path().join("remote.git");
    let out = std::process::Command::new("git")
        .args(["init", "--bare", "--initial-branch=main"])
        .arg(&remote)
        .output()
        .unwrap();
    assert!(out.status.success());

    crate::core::backup_workspace::initialize(&store).unwrap();
    let repo_dir = crate::core::backup_workspace::repo_dir();
    git_backup::set_remote_unlocked(&repo_dir, remote.to_str().unwrap()).unwrap();
    git_backup::push_unlocked(&repo_dir).unwrap();

    TestEnv {
        _lock: lock,
        _tmp: tmp,
        store,
        skills_dir,
        repo_dir,
        remote,
    }
}

#[test]
fn enabled_background_scheduler_uploads_pending_changes() {
    let env = test_env();
    std::fs::create_dir_all(env.skills_dir.join("demo")).unwrap();
    std::fs::write(env.skills_dir.join("demo/SKILL.md"), "pending edit").unwrap();
    let store = env.store.clone();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(async {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let task = tokio::spawn(run_scheduler(
            store,
            move |_, outcome| {
                let _ = tx.send(outcome);
            },
            Duration::from_millis(1),
            Duration::from_millis(1),
        ));
        let outcome = tokio::time::timeout(Duration::from_secs(10), rx.recv()).await;
        task.abort();
        assert_eq!(outcome.unwrap(), Some(Outcome::BackedUp));
    });
    assert_eq!(
        git_out(&env.remote, &["show", "main:skills/demo/SKILL.md"]),
        "pending edit"
    );
    assert_eq!(
        git_out(&env.remote, &["rev-parse", "main"]),
        git_out(&env.repo_dir, &["rev-parse", "HEAD"])
    );
}

#[test]
fn round_commits_and_pushes_without_snapshot_tag() {
    let env = test_env();
    std::fs::create_dir_all(env.skills_dir.join("skill-a")).unwrap();
    std::fs::write(env.skills_dir.join("skill-a/SKILL.md"), "content").unwrap();

    let outcome = run_round_blocking(&env.store);
    assert_eq!(outcome, Outcome::BackedUp);

    // The change reached the remote…
    let remote_head = git_out(&env.remote, &["rev-parse", "main"]);
    let local_head = git_out(&env.repo_dir, &["rev-parse", "HEAD"]);
    assert_eq!(remote_head, local_head);
    let commit_msg = git_out(&env.repo_dir, &["log", "-1", "--format=%s"]);
    assert!(
        commit_msg.starts_with("auto backup"),
        "unexpected commit message: {commit_msg}"
    );
    assert_eq!(git_out(&env.repo_dir, &["tag", "--list", "sm-v-*"]), "");
    let history = git_backup::list_snapshot_versions(&env.repo_dir, Some(50)).unwrap();
    assert_eq!(history.first().map(|version| version.tag.as_str()), Some(local_head.as_str()),
            "a successful automatic backup must appear in restorable history even without a snapshot tag");

    // A second round with nothing new is a no-op.
    assert_eq!(run_round_blocking(&env.store), Outcome::UpToDate);
}

#[test]
fn a_reftable_repo_fails_the_round_visibly_instead_of_skipping() {
    let env = test_env();
    let out = std::process::Command::new("git")
        .arg("-C")
        .arg(&env.repo_dir)
        .args(["refs", "migrate", "--ref-format=reftable"])
        .output()
        .unwrap();
    if !out.status.success() {
        eprintln!("skipping: this git cannot migrate to reftable");
        return;
    }
    match run_round_blocking(&env.store) {
        Outcome::Failed(msg) => assert!(msg.contains("reftable"), "{msg}"),
        other => panic!("expected a visible failure, got {other:?}"),
    }
}

/// Clone the test remote as a second "device" with its own identity.
fn clone_other_device(env: &TestEnv) -> std::path::PathBuf {
    let other = env._tmp.path().join("other");
    let out = std::process::Command::new("git")
        .arg("clone")
        .arg(&env.remote)
        .arg(&other)
        .output()
        .unwrap();
    assert!(out.status.success());
    git_backup::configure_device_identity(&other, "Device B").unwrap();
    std::fs::create_dir_all(other.join("skills")).unwrap();
    other
}

#[test]
fn round_with_system_engine_waits_for_manual_sync_when_remote_ahead() {
    let env = test_env();
    // Escape hatch: the legacy engine never merges in the background.
    env.store.set_setting("merge_engine", "system").unwrap();
    let other = clone_other_device(&env);
    std::fs::write(other.join("skills/from-b.md"), "b").unwrap();
    git(&other, &["add", "-A"]);
    git(&other, &["commit", "-m", "from B"]);
    git(&other, &["push", "origin", "main"]);

    std::fs::write(env.skills_dir.join("local.md"), "a").unwrap();

    let outcome = run_round_blocking(&env.store);
    assert_eq!(outcome, Outcome::RemoteAhead);
    // The local change was still committed (protected locally)…
    assert!(!git_backup::has_uncommitted_changes(&env.repo_dir).unwrap());
    // …but nothing reached the remote and no failure is recorded.
    assert_eq!(
        git_out(&env.remote, &["log", "-1", "--format=%s", "main"]),
        "from B"
    );
    assert_eq!(env.store.get_setting(SETTING_LAST_ERROR).unwrap(), None);
}

#[test]
fn round_merges_remote_changes_and_pushes_back() {
    // 3d-γ: with the (default) object engine, a round that finds the
    // remote ahead merges it and pushes the result — hands-free two-way
    // sync, including the round's own fetch.
    let env = test_env();
    let other = clone_other_device(&env);
    std::fs::write(other.join("skills/from-b.md"), "b").unwrap();
    git_backup::commit_all_unlocked(&other, "from B").unwrap();
    git(&other, &["push", "origin", "main"]);

    // No manual fetch here — the round discovers the remote change itself.
    std::fs::write(env.skills_dir.join("local.md"), "a").unwrap();
    let outcome = run_round_blocking(&env.store);
    assert_eq!(outcome, Outcome::BackedUp);

    // Both sides' changes are present locally and on the remote.
    assert!(env.skills_dir.join("from-b.md").exists());
    assert!(env.skills_dir.join("local.md").exists());
    let remote_head = git_out(&env.remote, &["rev-parse", "main"]);
    let local_head = git_out(&env.repo_dir, &["rev-parse", "HEAD"]);
    assert_eq!(remote_head, local_head);
    assert_eq!(env.store.get_setting(SETTING_LAST_ERROR).unwrap(), None);
}

#[test]
fn round_pauses_when_remote_touches_a_pending_conflict() {
    // §4 收窄阻尼: a remote change to a skill that awaits a local
    // conflict decision pauses the automatic round; an unrelated remote
    // change keeps flowing.
    let env = test_env();
    let other = clone_other_device(&env);

    // A managed skill exists on both sides (seeded through the remote).
    let seed_skill = |dir: &Path| {
        let skill_dir = dir.join("alpha");
        std::fs::create_dir_all(&skill_dir).unwrap();
        std::fs::write(skill_dir.join("SKILL.md"), "base").unwrap();
        let meta_dir = dir.join(".agent-hub/skills");
        std::fs::create_dir_all(&meta_dir).unwrap();
        let meta = crate::core::sync_metadata::SkillMetaFile {
            schema_version: 1,
            skill_id: "skill-1".to_string(),
            path: "alpha".to_string(),
            path_key: "alpha".to_string(),
            enabled: true,
            tags: vec![],
            source: crate::core::sync_metadata::SourceMeta {
                source_type: "import".to_string(),
                ref_: None,
                subpath: None,
                branch: None,
            },
        };
        std::fs::write(
            meta_dir.join("skill-1.json"),
            crate::core::sync_metadata::canonical_json_bytes(&meta).unwrap(),
        )
        .unwrap();
        std::fs::write(
                dir.join(".agent-hub/schema.json"),
                b"{\n  \"schema_version\": 1,\n  \"app_min_version\": \"2.0.0\",\n  \"created_by\": \"agent-hub\"\n}\n",
            )
            .unwrap();
    };
    seed_skill(&env.skills_dir);
    crate::core::sync_metadata::reindex_from_metadata_unlocked(&env.store).unwrap();
    crate::core::backup_workspace::commit(&env.store, "seed skill").unwrap();
    git_backup::push_unlocked(&env.repo_dir).unwrap();
    git(&other, &["pull", "origin", "main"]);

    // The skill is pending a local decision (projection row is the gate
    // the damping check reads).
    env.store
        .replace_pending_conflicts(&[crate::core::skill_store::PendingConflictRow {
            skill_id: "skill-1".to_string(),
            theirs_commit: String::new(),
            theirs_path: Some("skills/alpha".to_string()),
            detected_at: 1,
        }])
        .unwrap();

    // Remote touches that very skill → the round pauses.
    std::fs::write(other.join("skills/alpha/SKILL.md"), "changed on B").unwrap();
    git_backup::commit_all_unlocked(&other, "touch pending skill").unwrap();
    git(&other, &["push", "origin", "main"]);
    std::fs::write(env.skills_dir.join("local.md"), "a").unwrap();
    let outcome = run_round_blocking(&env.store);
    assert_eq!(outcome, Outcome::PausedOnConflict);
    // Local version untouched, remote not merged.
    assert_eq!(
        std::fs::read_to_string(env.skills_dir.join("alpha/SKILL.md")).unwrap(),
        "base"
    );

    // Once the conflict is resolved (projection cleared), the same
    // remote state merges automatically again.
    env.store.replace_pending_conflicts(&[]).unwrap();
    let outcome = run_round_blocking(&env.store);
    assert_eq!(outcome, Outcome::BackedUp);
    assert_eq!(
        std::fs::read_to_string(env.skills_dir.join("alpha/SKILL.md")).unwrap(),
        "changed on B"
    );
}

#[test]
fn round_skips_when_disabled() {
    let env = test_env();
    env.store.set_setting(SETTING_ENABLED, "off").unwrap();
    std::fs::write(env.skills_dir.join("x.md"), "x").unwrap();
    assert_eq!(run_round_blocking(&env.store), Outcome::Skipped("disabled"));
    assert_eq!(
        std::fs::read_to_string(env.skills_dir.join("x.md")).unwrap(),
        "x"
    );
    assert!(!env.repo_dir.join("skills/x.md").exists());
}

#[test]
fn commit_on_exit_commits_locally_without_pushing() {
    let env = test_env();
    let remote_before = git_out(&env.remote, &["rev-parse", "main"]);
    std::fs::write(env.skills_dir.join("late-edit.md"), "bye").unwrap();

    commit_on_exit(&env.store);

    assert!(!git_backup::has_uncommitted_changes(&env.repo_dir).unwrap());
    let commit_msg = git_out(&env.repo_dir, &["log", "-1", "--format=%s"]);
    assert!(
        commit_msg.starts_with("auto backup"),
        "unexpected commit message: {commit_msg}"
    );
    assert_eq!(git_out(&env.remote, &["rev-parse", "main"]), remote_before);
}
