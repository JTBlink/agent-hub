mod rename;
mod repository_overwrite;
use super::*;
use std::fs;
use tempfile::{tempdir, TempDir};

struct TestRepo {
    _lock: std::sync::MutexGuard<'static, ()>,
    _tmp: TempDir,
    store: SkillStore,
}

impl Drop for TestRepo {
    fn drop(&mut self) {
        central_repo::set_test_base_dir_override(None);
    }
}

fn test_repo() -> TestRepo {
    let lock = central_repo::test_base_dir_lock();
    let tmp = tempdir().unwrap();
    let base = tmp.path().join("repo");
    central_repo::set_test_base_dir_override(Some(base.clone()));
    fs::create_dir_all(central_repo::skills_dir()).unwrap();
    let store = SkillStore::new(&base.join("test.db")).unwrap();
    TestRepo {
        _lock: lock,
        _tmp: tmp,
        store,
    }
}

fn write_skill_dir(name: &str) -> PathBuf {
    let dir = central_repo::skills_dir().join(name);
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("SKILL.md"), format!("---\nname: {name}\n---\n")).unwrap();
    dir
}

fn sample_skill(id: &str, name: &str, central_path: &Path) -> SkillRecord {
    SkillRecord {
        id: id.to_string(),
        name: name.to_string(),
        description: None,
        source_type: "import".to_string(),
        source_ref: Some(central_path.to_string_lossy().to_string()),
        source_ref_resolved: None,
        source_subpath: None,
        source_branch: None,
        source_revision: None,
        source_agent: None,
        remote_revision: None,
        central_path: central_path.to_string_lossy().to_string(),
        content_hash: None,
        enabled: true,
        created_at: 1,
        updated_at: 1,
        status: "ok".to_string(),
        update_status: "local_only".to_string(),
        last_checked_at: None,
        last_check_error: None,
    }
}

#[test]
fn batch_delete_removes_skills_targets_and_stale_metadata_once() {
    let repo = test_repo();
    let skill_one_dir = write_skill_dir("skill-one");
    let skill_two_dir = write_skill_dir("skill-two");
    repo.store
        .insert_skill(&sample_skill("skill-1", "skill-one", &skill_one_dir))
        .unwrap();
    repo.store
        .insert_skill(&sample_skill("skill-2", "skill-two", &skill_two_dir))
        .unwrap();

    let target_dir = repo._tmp.path().join("target-skill-one");
    fs::create_dir_all(&target_dir).unwrap();
    fs::write(target_dir.join("SKILL.md"), "# target").unwrap();
    // A real directory pairs with a copy record; a symlink record over a
    // real directory is the #435 data-loss shape and now preserves it
    // (see deleting_a_skill_preserves_user_content_...).
    repo.store
        .insert_target(&SkillTargetRecord {
            id: "target-1".to_string(),
            skill_id: "skill-1".to_string(),
            tool: "cursor".to_string(),
            target_path: target_dir.to_string_lossy().to_string(),
            mode: "copy".to_string(),
            status: "ok".to_string(),
            synced_at: Some(1),
            last_error: None,
            source_hash: None,
        })
        .unwrap();

    sync_metadata::write_all_from_db_unlocked(&repo.store).unwrap();
    assert!(sync_metadata::metadata_dir()
        .join("skills/skill-1.json")
        .exists());
    assert!(sync_metadata::metadata_dir()
        .join("skills/skill-2.json")
        .exists());

    let result = delete_managed_skills_by_ids(
        &repo.store,
        &["skill-1".to_string(), "missing-skill".to_string()],
    )
    .unwrap();

    assert_eq!(result.deleted, 1);
    assert_eq!(result.failed, vec!["missing-skill".to_string()]);
    assert!(repo.store.get_skill_by_id("skill-1").unwrap().is_none());
    assert!(repo.store.get_skill_by_id("skill-2").unwrap().is_some());
    assert!(!skill_one_dir.exists());
    assert!(skill_two_dir.exists());
    assert!(!target_dir.exists());
    assert!(!sync_metadata::metadata_dir()
        .join("skills/skill-1.json")
        .exists());
    assert!(sync_metadata::metadata_dir()
        .join("skills/skill-2.json")
        .exists());
}

#[test]
fn skillssh_install_reuses_same_content_from_local_import() {
    let repo = test_repo();
    let existing_dir = write_skill_dir("agent-browser");
    let hash = installer::hash_local_source(&existing_dir).unwrap();
    let mut existing = sample_skill("local", "agent-browser", &existing_dir);
    existing.content_hash = Some(hash.clone());
    repo.store.insert_skill(&existing).unwrap();

    let (name, path) = resolve_skillssh_install_target(
        &repo.store,
        "owner/repo/agent-browser",
        "agent-browser",
        Some(&hash),
    )
    .unwrap();
    assert_eq!(name, "agent-browser");
    assert_eq!(path, existing_dir);
}

/// The whole point of the preflight: it must see the user's file in the
/// library *and* the one in an agent's deployed copy, and say which is
/// which — a bare filename does not tell anyone where to go and rescue it.
#[test]
fn the_preflight_covers_the_library_and_every_deployed_copy() {
    let repo = test_repo();
    let central = write_skill_dir("ppt-master");
    fs::create_dir_all(central.join("templates")).unwrap();
    fs::write(central.join("templates/mine.pptx"), "user work").unwrap();
    repo.store
        .insert_skill(&sample_skill("skill-1", "ppt-master", &central))
        .unwrap();

    // A copy-mode deployment the user has also written into.
    let target_dir = repo._tmp.path().join("agent/ppt-master");
    fs::create_dir_all(&target_dir).unwrap();
    fs::write(target_dir.join("SKILL.md"), "x").unwrap();
    fs::write(target_dir.join("notes.md"), "notes in the agent copy").unwrap();
    repo.store
        .insert_target(&SkillTargetRecord {
            id: "t1".to_string(),
            skill_id: "skill-1".to_string(),
            tool: "claude_code".to_string(),
            target_path: target_dir.to_string_lossy().to_string(),
            mode: "copy".to_string(),
            status: "ok".to_string(),
            synced_at: Some(1),
            last_error: None,
            source_hash: None,
        })
        .unwrap();

    // The new version carries only SKILL.md.
    let staged = repo._tmp.path().join("staged");
    fs::create_dir_all(&staged).unwrap();
    fs::write(staged.join("SKILL.md"), "v2").unwrap();

    let skill = repo.store.get_skill_by_id("skill-1").unwrap().unwrap();
    let pending = pending_removals_for(&repo.store, &skill, Some(&staged)).unwrap();

    let found: Vec<(String, String)> = pending
        .iter()
        .map(|p| (p.location.clone(), p.path.replace('\\', "/")))
        .collect();
    assert!(
        found.contains(&(LIBRARY_LOCATION.to_string(), "templates/".to_string())),
        "the library's own directory must be reported: {found:?}"
    );
    assert!(
        found.contains(&("claude_code".to_string(), "notes.md".to_string())),
        "the agent copy is torn down and rebuilt too: {found:?}"
    );
}

/// With no content change nothing is swapped, so the library keeps what it
/// has — but the deployments are still rebuilt from it, which is its own way
/// to lose a file.
#[test]
fn a_metadata_only_update_still_checks_the_deployed_copies() {
    let repo = test_repo();
    let central = write_skill_dir("stable");
    repo.store
        .insert_skill(&sample_skill("skill-1", "stable", &central))
        .unwrap();

    let target_dir = repo._tmp.path().join("agent/stable");
    fs::create_dir_all(&target_dir).unwrap();
    fs::write(target_dir.join("SKILL.md"), "x").unwrap();
    fs::write(target_dir.join("mine.txt"), "only in the agent copy").unwrap();
    repo.store
        .insert_target(&SkillTargetRecord {
            id: "t1".to_string(),
            skill_id: "skill-1".to_string(),
            tool: "cursor".to_string(),
            target_path: target_dir.to_string_lossy().to_string(),
            mode: "copy".to_string(),
            status: "ok".to_string(),
            synced_at: Some(1),
            last_error: None,
            source_hash: None,
        })
        .unwrap();

    let skill = repo.store.get_skill_by_id("skill-1").unwrap().unwrap();
    // `None` staged: the library is unchanged, and is itself the baseline.
    let pending = pending_removals_for(&repo.store, &skill, None).unwrap();
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].location, "cursor");
    assert_eq!(pending[0].path, "mine.txt");
}

/// Symlink-mode deployments are not copied over, so they are not at risk and
/// must not generate noise.
#[test]
fn symlink_deployments_are_not_reported() {
    let repo = test_repo();
    let central = write_skill_dir("linked");
    repo.store
        .insert_skill(&sample_skill("skill-1", "linked", &central))
        .unwrap();

    let target_dir = repo._tmp.path().join("agent/linked");
    fs::create_dir_all(&target_dir).unwrap();
    fs::write(target_dir.join("whatever.md"), "x").unwrap();
    repo.store
        .insert_target(&SkillTargetRecord {
            id: "t1".to_string(),
            skill_id: "skill-1".to_string(),
            tool: "grok".to_string(),
            target_path: target_dir.to_string_lossy().to_string(),
            mode: "symlink".to_string(),
            status: "ok".to_string(),
            synced_at: Some(1),
            last_error: None,
            source_hash: None,
        })
        .unwrap();

    let skill = repo.store.get_skill_by_id("skill-1").unwrap().unwrap();
    assert!(pending_removals_for(&repo.store, &skill, None)
        .unwrap()
        .is_empty());
}

/// An approval answers one exact question: this revision, this list.
#[test]
fn an_approval_does_not_carry_to_a_different_revision_or_list() {
    let a = vec![PendingRemoval {
        location: LIBRARY_LOCATION.to_string(),
        path: "templates/mine.pptx".to_string(),
    }];
    let mut b = a.clone();
    b.push(PendingRemoval {
        location: LIBRARY_LOCATION.to_string(),
        path: "templates/another.pptx".to_string(),
    });

    assert_eq!(
        removal_approval_token("rev1", &a),
        removal_approval_token("rev1", &a),
        "the same question must produce the same token"
    );
    assert_ne!(
        removal_approval_token("rev1", &a),
        removal_approval_token("rev2", &a),
        "upstream moved on"
    );
    assert_ne!(
        removal_approval_token("rev1", &a),
        removal_approval_token("rev1", &b),
        "the skill wrote another file while the dialog was open"
    );
}

/// Drives the real `reimport_local_skill_internal`, because the bug this
/// guards against was in the wiring, not the hash: the approval was compared
/// against a constant, so the recomputed list was never consulted. A test
/// that only calls the token function twice passes either way.
#[test]
fn a_stale_reimport_approval_does_not_authorize_a_grown_list() {
    let repo = test_repo();
    let source = repo._tmp.path().join("source");
    fs::create_dir_all(&source).unwrap();
    fs::write(source.join("SKILL.md"), "---\nname: gen\n---\n").unwrap();

    let central = write_skill_dir("gen");
    fs::write(central.join("mine.txt"), "user work").unwrap();
    let mut record = sample_skill("skill-1", "gen", &central);
    record.source_ref = Some(source.to_string_lossy().to_string());
    repo.store.insert_skill(&record).unwrap();

    // First attempt: held, with a token for the list the user is shown.
    let first = reimport_local_skill_internal(&repo.store, "skill-1", None).unwrap();
    assert_eq!(first.pending_removals.len(), 1);
    let shown = first.removal_approval.clone().unwrap();
    assert!(central.join("mine.txt").is_file(), "nothing may be touched");

    // The skill writes another file while the dialog is open.
    fs::write(central.join("appeared-later.txt"), "also mine").unwrap();

    // The old approval must not cover it.
    let second = reimport_local_skill_internal(&repo.store, "skill-1", Some(&shown)).unwrap();
    assert_eq!(
        second.pending_removals.len(),
        2,
        "the grown list must be shown again, not silently applied"
    );
    assert!(central.join("appeared-later.txt").is_file());
    assert!(central.join("mine.txt").is_file());

    // Approving the list actually shown does go through.
    let approved = second.removal_approval.clone().unwrap();
    let third = reimport_local_skill_internal(&repo.store, "skill-1", Some(&approved)).unwrap();
    assert!(third.pending_removals.is_empty());
    assert!(
        !central.join("mine.txt").exists(),
        "the approved removal applies"
    );
}

fn write_skill_at(root: &Path, rel: &str) -> PathBuf {
    let dir = root.join(rel);
    fs::create_dir_all(&dir).unwrap();
    let basename = dir.file_name().unwrap().to_string_lossy().to_string();
    fs::write(
        dir.join("SKILL.md"),
        format!("---\nname: {basename}\n---\n"),
    )
    .unwrap();
    dir
}

#[test]
fn collect_git_skill_dirs_finds_nested_categories() {
    // Mirrors mattpocock/skills layout: skills/<category>/<skill>/SKILL.md.
    let tmp = tempdir().unwrap();
    let root = tmp.path();
    write_skill_at(root, "in-progress/foo");
    write_skill_at(root, "in-progress/bar");
    write_skill_at(root, "stable/baz");

    let dirs = collect_git_skill_dirs(root);
    let keys: Vec<String> = dirs.iter().map(|d| skill_rel_key(root, d)).collect();
    assert_eq!(dirs.len(), 3, "should find skills two levels deep");
    assert!(keys.contains(&"in-progress/foo".to_string()));
    assert!(keys.contains(&"in-progress/bar".to_string()));
    assert!(keys.contains(&"stable/baz".to_string()));
}

#[test]
fn collect_git_skill_dirs_returns_self_when_root_is_skill() {
    let tmp = tempdir().unwrap();
    let root = tmp.path();
    fs::write(root.join("SKILL.md"), "---\nname: x\n---").unwrap();
    let dirs = collect_git_skill_dirs(root);
    assert_eq!(dirs, vec![root.to_path_buf()]);
}

#[test]
fn collect_git_skill_dirs_returns_empty_when_no_skills() {
    // Previously this case returned [skill_dir] as a bogus fallback,
    // which then surfaced a non-skill category dir as installable.
    let tmp = tempdir().unwrap();
    let root = tmp.path();
    fs::create_dir_all(root.join("empty-category")).unwrap();
    let dirs = collect_git_skill_dirs(root);
    assert!(dirs.is_empty(), "no fallback to scan root when empty");
}

#[test]
fn skill_rel_key_uses_forward_slashes() {
    let tmp = tempdir().unwrap();
    let root = tmp.path().join("repo");
    let nested = root.join("a").join("b");
    let key = skill_rel_key(&root, &nested);
    assert_eq!(key, "a/b");
}

#[test]
fn skill_rel_key_disambiguates_same_basename_across_categories() {
    // Two skills with the same dir basename in different categories must
    // produce distinct rel keys — that's the point of using rel paths.
    let tmp = tempdir().unwrap();
    let root = tmp.path();
    let a_foo = write_skill_at(root, "category-a/foo");
    let b_foo = write_skill_at(root, "category-b/foo");

    let dirs = collect_git_skill_dirs(root);
    assert_eq!(dirs.len(), 2);

    let k_a = skill_rel_key(root, &a_foo);
    let k_b = skill_rel_key(root, &b_foo);
    assert_ne!(k_a, k_b);
    assert_eq!(k_a, "category-a/foo");
    assert_eq!(k_b, "category-b/foo");
}

// ── RemoteKey dedup (batch check_all fan-out) ──

fn source(clone_url: &str, branch: Option<&str>, subpath: Option<&str>) -> GitSkillSource {
    GitSkillSource {
        clone_url: clone_url.to_string(),
        branch: branch.map(str::to_string),
        subpath: subpath.map(str::to_string),
        locator_skill_id: None,
    }
}

/// The whole point of keying Phase A by `RemoteKey`: skills installed from
/// different subdirectories of the same monorepo (same clone_url + branch)
/// must collapse to one network query, while a different branch stays
/// distinct. This is what turns 4 `mattpocock/skills` skills into 1
/// `ls-remote` instead of 4.
#[test]
fn remote_key_dedups_by_url_and_branch_ignoring_subpath() {
    let mut per_remote: HashMap<RemoteKey, usize> = HashMap::new();
    let skills = [
        source("https://github.com/mattpocock/skills.git", None, Some("a")),
        source("https://github.com/mattpocock/skills.git", None, Some("b")),
        source("https://github.com/mattpocock/skills.git", None, None),
        source("https://github.com/vercel/ai.git", None, None),
        // Same repo, different branch → must NOT collapse with the None-branch group.
        source(
            "https://github.com/mattpocock/skills.git",
            Some("next"),
            None,
        ),
    ];
    for s in skills {
        *per_remote.entry(RemoteKey::from(s)).or_insert(0) += 1;
    }

    assert_eq!(per_remote.len(), 3, "distinct remotes to query");
    assert_eq!(
        per_remote[&RemoteKey {
            clone_url: "https://github.com/mattpocock/skills.git".to_string(),
            branch: None,
        }],
        3,
        "three subpaths of one repo/branch share a single query"
    );
    assert_eq!(
        per_remote[&RemoteKey {
            clone_url: "https://github.com/mattpocock/skills.git".to_string(),
            branch: Some("next".to_string()),
        }],
        1,
        "a different branch is a separate remote"
    );
}

fn remote(url: &str, branch: Option<&str>) -> RemoteKey {
    RemoteKey {
        clone_url: url.to_string(),
        branch: branch.map(|b| b.to_string()),
    }
}

/// Work-stealing must cover every remote exactly once and collect each
/// resolver result under its own key — this exercises the real concurrent
/// loop, not just `RemoteKey`'s hashing.
#[test]
fn resolve_concurrent_resolves_every_remote_exactly_once() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let remotes: Vec<RemoteKey> = (0..20)
        .map(|i| remote(&format!("https://example.test/r{i}"), None))
        .collect();
    let calls = AtomicUsize::new(0);

    let out = resolve_concurrent(remotes.clone(), |key| {
        calls.fetch_add(1, Ordering::Relaxed);
        Ok(format!("rev:{}", key.clone_url))
    });

    assert_eq!(
        calls.load(Ordering::Relaxed),
        remotes.len(),
        "each remote resolved exactly once"
    );
    assert_eq!(out.len(), remotes.len());
    for key in &remotes {
        assert!(matches!(out.get(key), Some(Ok(v)) if *v == format!("rev:{}", key.clone_url)));
    }
}

/// A single remote failing must be stored as `Err` for that key alone and
/// never abort the batch (the "检查全部 both crawled and popped failures" fix
/// depends on this isolation).
#[test]
fn resolve_concurrent_isolates_per_remote_failures() {
    let ok = remote("https://example.test/ok", None);
    let bad = remote("https://example.test/bad", Some("main"));

    let out = resolve_concurrent(vec![ok.clone(), bad.clone()], |key| {
        if key.clone_url.ends_with("/bad") {
            Err("boom".to_string())
        } else {
            Ok("rev".to_string())
        }
    });

    assert!(matches!(out.get(&ok), Some(Ok(v)) if v == "rev"));
    assert!(matches!(out.get(&bad), Some(Err(e)) if e == "boom"));
}

/// The resolutions must genuinely overlap: with several remotes and a
/// resolver that lingers, more than one worker is inside `resolve` at once.
/// Because `resolve_concurrent` holds no `RepoLock`, this is also the proof
/// that the network step runs off the central-repo lock.
#[test]
fn resolve_concurrent_runs_remotes_in_parallel() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let remotes: Vec<RemoteKey> = (0..8).map(|i| remote(&format!("r{i}"), None)).collect();
    let in_flight = AtomicUsize::new(0);
    let peak = AtomicUsize::new(0);

    let out = resolve_concurrent(remotes, |_key| {
        let now = in_flight.fetch_add(1, Ordering::SeqCst) + 1;
        peak.fetch_max(now, Ordering::SeqCst);
        std::thread::sleep(std::time::Duration::from_millis(20));
        in_flight.fetch_sub(1, Ordering::SeqCst);
        Ok("rev".to_string())
    });

    assert_eq!(out.len(), 8);
    assert!(
        peak.load(Ordering::SeqCst) >= 2,
        "expected concurrent resolution, peak in-flight was {}",
        peak.load(Ordering::SeqCst)
    );
}

// ── Applying a prefetched remote under the lock ──

/// A git-backed skill pinned at `old-rev` on `remote_url`.
fn insert_git_skill(store: &SkillStore, id: &str, remote_url: &str) {
    let dir = write_skill_dir(id);
    let mut skill = sample_skill(id, id, &dir);
    skill.source_type = "git".to_string();
    skill.source_ref = Some(remote_url.to_string());
    skill.source_ref_resolved = Some(remote_url.to_string());
    skill.source_revision = Some("old-rev".to_string());
    skill.update_status = "unknown".to_string();
    store.insert_skill(&skill).unwrap();
}

fn prefetch(url: &str, revision: &str) -> Option<PrefetchedRemote> {
    Some(PrefetchedRemote {
        key: remote(url, None),
        result: Ok(revision.to_string()),
    })
}

/// The happy path: a prefetch resolved for the skill's own remote is applied.
#[test]
fn matching_prefetched_remote_is_applied() {
    let repo = test_repo();
    insert_git_skill(&repo.store, "skill-1", "https://example.test/a.git");

    let dto = check_skill_update_internal_with_remote(
        &repo.store,
        "skill-1",
        false,
        prefetch("https://example.test/a.git", "new-rev"),
    )
    .unwrap();

    assert_eq!(dto.update_status, "update_available");
    let stored = repo.store.get_skill_by_id("skill-1").unwrap().unwrap();
    assert_eq!(stored.remote_revision.as_deref(), Some("new-rev"));
}

/// A reinstall between the off-lock resolve and this write keeps the skill's
/// row but repoints its source. The revision resolved for the *old* remote
/// must not be recorded against the new one — it would show a fabricated
/// "up to date"/"update available" for a source it was never read from.
#[test]
fn prefetched_remote_for_a_different_source_is_discarded() {
    let repo = test_repo();
    insert_git_skill(&repo.store, "skill-1", "https://example.test/new.git");

    let dto = check_skill_update_internal_with_remote(
        &repo.store,
        "skill-1",
        false,
        prefetch("https://example.test/old.git", "rev-of-old-remote"),
    )
    .unwrap();

    assert_eq!(
        dto.update_status, "unknown",
        "status left for the next round"
    );
    let stored = repo.store.get_skill_by_id("skill-1").unwrap().unwrap();
    assert_eq!(
        stored.remote_revision, None,
        "no revision from a stale remote"
    );
    assert_eq!(stored.last_checked_at, None, "the check did not complete");
}

/// Insert a `local` skill whose library copy is `central_body` and whose
/// original source path holds `source_body`, with the stored hash recorded
/// from the library copy exactly as an install would leave it.
fn insert_local_skill(repo: &TestRepo, id: &str, central_body: &str, source_body: &str) {
    let central = central_repo::skills_dir().join(id);
    fs::create_dir_all(&central).unwrap();
    fs::write(central.join("SKILL.md"), central_body).unwrap();

    let source = repo._tmp.path().join(format!("{id}-source"));
    fs::create_dir_all(&source).unwrap();
    fs::write(source.join("SKILL.md"), source_body).unwrap();

    let mut skill = sample_skill(id, id, &central);
    skill.source_type = "local".to_string();
    skill.source_ref = Some(source.to_string_lossy().to_string());
    skill.content_hash = Some(crate::core::content_hash::hash_directory(&central).unwrap());
    skill.update_status = "unknown".to_string();
    repo.store.insert_skill(&skill).unwrap();
}

/// Drives the real check, because the wiring is where this can go wrong:
/// the tiebreaker can be correct and still never be consulted. A Windows
/// checkout of the same skill is CRLF while the library copy synced from a
/// Mac is LF — byte hashes disagree, but there is no update to offer, and
/// offering one starts a re-import ping-pong between the two machines.
#[test]
fn a_local_source_that_differs_only_in_line_endings_is_up_to_date() {
    let repo = test_repo();
    insert_local_skill(
        &repo,
        "skill-1",
        "---\nname: skill-1\n---\nbody\n",
        "---\r\nname: skill-1\r\n---\r\nbody\r\n",
    );

    let dto = check_skill_update_internal_with_remote(&repo.store, "skill-1", true, None).unwrap();

    assert_eq!(dto.update_status, "up_to_date");
}

/// #502: `npm install` in a local skill's source is not an update.
#[test]
fn a_local_source_with_only_installed_dependencies_is_up_to_date() {
    let repo = test_repo();
    let body = "---\nname: skill-1\n---\nbody\n";
    insert_local_skill(&repo, "skill-1", body, body);
    let deps = repo._tmp.path().join("skill-1-source/node_modules/pkg");
    fs::create_dir_all(&deps).unwrap();
    fs::write(deps.join("index.js"), "module.exports = 1;\n").unwrap();

    let dto = check_skill_update_internal_with_remote(&repo.store, "skill-1", true, None).unwrap();

    assert_eq!(dto.update_status, "up_to_date");
}

/// A vanished library copy still has an update to offer. This is a
/// regression guard on the end-to-end path, not proof of the empty-tree
/// guard itself — a non-empty source cannot collide with an empty library,
/// so what pins that collision is
/// `content_hash::tests::an_empty_or_missing_directory_has_no_tiebreaker_hash`.
#[test]
fn a_missing_library_copy_is_not_up_to_date() {
    let repo = test_repo();
    insert_local_skill(
        &repo,
        "skill-1",
        "---\nname: skill-1\n---\nbody\n",
        "---\r\nname: skill-1\r\n---\r\nbody\r\n",
    );
    fs::remove_dir_all(central_repo::skills_dir().join("skill-1")).unwrap();

    let dto = check_skill_update_internal_with_remote(&repo.store, "skill-1", true, None).unwrap();

    assert_eq!(dto.update_status, "update_available");
}

/// The other half of the same wiring: the tiebreaker must not swallow a
/// real edit. Without this, "always up to date" would pass the test above.
#[test]
fn a_local_source_with_a_real_edit_still_reports_an_update() {
    let repo = test_repo();
    insert_local_skill(
        &repo,
        "skill-1",
        "---\nname: skill-1\n---\nbody\n",
        "---\r\nname: skill-1\r\n---\r\nbody, rewritten\r\n",
    );

    let dto = check_skill_update_internal_with_remote(&repo.store, "skill-1", true, None).unwrap();

    assert_eq!(dto.update_status, "update_available");
}

/// A remote that failed to resolve off the lock still has to land as an
/// `error` status here, not be swallowed as "nothing to apply" — the batch
/// check counts that error and the card shows the reason.
#[test]
fn failed_prefetch_for_the_current_source_records_the_error() {
    let repo = test_repo();
    insert_git_skill(&repo.store, "skill-1", "https://example.test/a.git");

    let err = check_skill_update_internal_with_remote(
        &repo.store,
        "skill-1",
        false,
        Some(PrefetchedRemote {
            key: remote("https://example.test/a.git", None),
            result: Err("could not read from remote".to_string()),
        }),
    )
    .unwrap_err();

    assert!(err.message.contains("could not read from remote"));
    let stored = repo.store.get_skill_by_id("skill-1").unwrap().unwrap();
    assert_eq!(stored.update_status, "error");
    assert_eq!(
        stored.last_check_error.as_deref(),
        Some("could not read from remote")
    );
}

/// Callers hold the central-repo lock across this write, so a git skill with
/// nothing prefetched must be skipped rather than resolved inline — that
/// inline call is the lock-held network round-trip behind the 20s "busy"
/// failures (#315).
#[test]
fn missing_prefetch_never_resolves_under_the_lock() {
    let repo = test_repo();
    insert_git_skill(&repo.store, "skill-1", "https://example.test/a.git");

    let dto = check_skill_update_internal_with_remote(&repo.store, "skill-1", false, None).unwrap();

    assert_eq!(dto.update_status, "unknown");
    let stored = repo.store.get_skill_by_id("skill-1").unwrap().unwrap();
    assert_eq!(stored.last_checked_at, None, "no network, no write");
}

fn write_skill(dir: &Path, name: &str) {
    fs::create_dir_all(dir).unwrap();
    fs::write(
        dir.join("SKILL.md"),
        format!("---\nname: {name}\ndescription: d\n---\nbody\n"),
    )
    .unwrap();
}

#[test]
fn repoint_accepts_a_valid_subpath() {
    let tmp = tempdir().unwrap();
    let repo = tmp.path();
    write_skill(&repo.join("note-manager"), "note-manager");

    let resolved = resolve_repoint_skill_dir(repo, Some("note-manager")).unwrap();
    assert_eq!(resolved, repo.join("note-manager"));
}

#[test]
fn repoint_accepts_repo_root_when_it_is_a_skill() {
    let tmp = tempdir().unwrap();
    write_skill(tmp.path(), "root-skill");

    let resolved = resolve_repoint_skill_dir(tmp.path(), None).unwrap();
    assert_eq!(resolved, tmp.path());
}

#[test]
fn repoint_rejects_repo_root_without_skill_md() {
    let tmp = tempdir().unwrap();
    fs::create_dir_all(tmp.path().join("some-dir")).unwrap();

    let err = resolve_repoint_skill_dir(tmp.path(), None).unwrap_err();
    assert!(
        err.message.contains("not a skill directory"),
        "{}",
        err.message
    );
}

#[test]
fn repoint_rejects_missing_subpath_instead_of_falling_back() {
    let tmp = tempdir().unwrap();
    let repo = tmp.path();
    // A real skill exists elsewhere: the lenient resolver would discover it.
    write_skill(&repo.join("other"), "other");

    let err = resolve_repoint_skill_dir(repo, Some("typo")).unwrap_err();
    assert!(err.message.contains("does not exist"), "{}", err.message);
}

#[test]
fn repoint_rejects_subpath_that_is_not_a_skill_dir() {
    let tmp = tempdir().unwrap();
    let repo = tmp.path();
    fs::create_dir_all(repo.join("docs")).unwrap();

    let err = resolve_repoint_skill_dir(repo, Some("docs")).unwrap_err();
    assert!(
        err.message.contains("not a skill directory"),
        "{}",
        err.message
    );
}

#[test]
fn repoint_rejects_absolute_subpath() {
    let tmp = tempdir().unwrap();
    let outside = tmp.path().join("outside");
    write_skill(&outside, "outside");
    let repo = tmp.path().join("repo");
    fs::create_dir_all(&repo).unwrap();

    // `Path::join` returns an absolute argument verbatim, so without the
    // guard this would install a directory from outside the checkout.
    let err = resolve_repoint_skill_dir(&repo, Some(outside.to_str().unwrap())).unwrap_err();
    assert!(
        err.message.contains("outside the repository"),
        "{}",
        err.message
    );
}

#[test]
fn repoint_rejects_parent_traversal_subpath() {
    let tmp = tempdir().unwrap();
    write_skill(&tmp.path().join("outside"), "outside");
    let repo = tmp.path().join("repo");
    fs::create_dir_all(&repo).unwrap();

    let err = resolve_repoint_skill_dir(&repo, Some("../outside")).unwrap_err();
    assert!(
        err.message.contains("outside the repository"),
        "{}",
        err.message
    );
}

#[cfg(unix)]
#[test]
fn repoint_rejects_symlink_escaping_the_checkout() {
    let tmp = tempdir().unwrap();
    let outside = tmp.path().join("outside");
    write_skill(&outside, "outside");
    let repo = tmp.path().join("repo");
    fs::create_dir_all(&repo).unwrap();
    std::os::unix::fs::symlink(&outside, repo.join("link")).unwrap();

    let err = resolve_repoint_skill_dir(&repo, Some("link")).unwrap_err();
    assert!(
        err.message.contains("outside the repository"),
        "{}",
        err.message
    );
}

// ── resolve_skill_dir: install / update / preview resolution ───────────
//
// Both inputs reach this from a URL the user pasted. The cases below are
// the ones that let a crafted or merely wrong URL resolve to something the
// caller did not ask for.

#[test]
fn resolve_accepts_a_subpath_inside_the_checkout() {
    let tmp = tempdir().unwrap();
    write_skill(&tmp.path().join("skills").join("pdf"), "pdf");

    let resolved = resolve_skill_dir(tmp.path(), Some("skills/pdf"), None).unwrap();
    assert_eq!(resolved, tmp.path().join("skills").join("pdf"));
}

#[test]
fn resolve_still_returns_a_container_for_enumeration() {
    // preview/confirm install walk a container to list the skills inside
    // it, so an existing non-skill directory must keep resolving.
    let tmp = tempdir().unwrap();
    write_skill(&tmp.path().join("skills").join("pdf"), "pdf");
    write_skill(&tmp.path().join("skills").join("docx"), "docx");

    let resolved = resolve_skill_dir(tmp.path(), Some("skills"), None).unwrap();
    assert_eq!(resolved, tmp.path().join("skills"));
    // What preview/confirm actually do with that container.
    assert_eq!(collect_git_skill_dirs(&resolved).len(), 2);
}

#[test]
fn resolve_rejects_parent_traversal_with_and_without_a_locator() {
    let tmp = tempdir().unwrap();
    write_skill(&tmp.path().join("outside"), "outside");
    let repo = tmp.path().join("repo");
    fs::create_dir_all(&repo).unwrap();

    // A locator must not soften the traversal check: the escaping path is
    // refused either way, never quietly ignored in favour of discovery.
    for locator in [None, Some("outside")] {
        let err = resolve_skill_dir(&repo, Some("../outside"), locator).unwrap_err();
        assert!(
            err.message.contains("outside the repository"),
            "locator {locator:?}: {}",
            err.message
        );
    }
}

#[test]
fn resolve_rejects_absolute_subpath() {
    let tmp = tempdir().unwrap();
    let outside = tmp.path().join("outside");
    write_skill(&outside, "outside");
    let repo = tmp.path().join("repo");
    fs::create_dir_all(&repo).unwrap();

    let err = resolve_skill_dir(&repo, Some(outside.to_str().unwrap()), None).unwrap_err();
    assert!(
        err.message.contains("outside the repository"),
        "{}",
        err.message
    );
}

#[cfg(unix)]
#[test]
fn resolve_rejects_subpath_symlinked_out_of_the_checkout() {
    let tmp = tempdir().unwrap();
    let outside = tmp.path().join("outside");
    write_skill(&outside, "outside");
    let repo = tmp.path().join("repo");
    fs::create_dir_all(&repo).unwrap();
    std::os::unix::fs::symlink(&outside, repo.join("link")).unwrap();

    let err = resolve_skill_dir(&repo, Some("link"), None).unwrap_err();
    assert!(
        err.message.contains("outside the repository"),
        "{}",
        err.message
    );
}

#[test]
fn resolve_rejects_a_locator_that_escapes_the_checkout() {
    // `owner/repo@../../x` survives parse_skillssh_shorthand, which only
    // checks the owner/repo half, so the locator itself can climb out.
    let tmp = tempdir().unwrap();
    write_skill(&tmp.path().join("outside"), "outside");
    let repo = tmp.path().join("repo");
    fs::create_dir_all(&repo).unwrap();

    let err = resolve_skill_dir(&repo, None, Some("../outside")).unwrap_err();
    assert!(
        err.message.contains("outside the repository"),
        "{}",
        err.message
    );
}

#[test]
fn resolve_refuses_a_missing_subpath_instead_of_discovering_the_container() {
    // The measured bug: a tree URL naming a directory that does not exist
    // installed the whole `skills/` container as one skill.
    let tmp = tempdir().unwrap();
    write_skill(&tmp.path().join("skills").join("pdf"), "pdf");

    let err = resolve_skill_dir(tmp.path(), Some("artifacts-builder"), None).unwrap_err();
    assert!(err.message.contains("does not exist"), "{}", err.message);
}

#[test]
fn resolve_lets_a_locator_recover_a_skill_that_moved_upstream() {
    // #278's recovery path: the stored subpath is stale because upstream
    // reorganized, and the locator finds the skill at its new home.
    let tmp = tempdir().unwrap();
    write_skill(&tmp.path().join("skills").join("db"), "db");

    let resolved = resolve_skill_dir(tmp.path(), Some("db"), Some("db")).unwrap();
    assert_eq!(resolved, tmp.path().join("skills").join("db"));
}

#[test]
fn resolve_lets_a_locator_override_a_path_that_is_no_longer_the_skill() {
    // The harder half of a reorganization: the stored path still exists,
    // but upstream turned it into a container and moved the skill. Taking
    // the path would copy the container over the installed skill.
    let tmp = tempdir().unwrap();
    fs::create_dir_all(tmp.path().join("db")).unwrap();
    write_skill(&tmp.path().join("db").join("nested"), "nested");
    write_skill(&tmp.path().join("skills").join("db"), "db");

    let resolved = resolve_skill_dir(tmp.path(), Some("db"), Some("db")).unwrap();
    assert_eq!(resolved, tmp.path().join("skills").join("db"));
}

#[test]
fn resolve_errors_when_the_locator_finds_nothing() {
    // Still #278: no match must not fall through to a container or root.
    let tmp = tempdir().unwrap();
    write_skill(&tmp.path().join("skills").join("db"), "db");

    let err = resolve_skill_dir(tmp.path(), Some("gone"), Some("nope-not-here")).unwrap_err();
    assert!(err.message.contains("not found"), "{}", err.message);
}

/// #435: removing a library skill used to delete whatever sat at each
/// recorded target. A real directory that replaced our symlink is the
/// user's local fork — it must survive the removal.
#[test]
fn deleting_a_skill_preserves_user_content_that_replaced_a_recorded_link() {
    let repo = test_repo();
    let dir = write_skill_dir("my-skill");
    repo.store
        .insert_skill(&sample_skill("s1", "my-skill", &dir))
        .unwrap();

    let agent_tmp = tempdir().unwrap();
    let target = agent_tmp.path().join("my-skill");
    fs::create_dir_all(&target).unwrap();
    fs::write(target.join("mine.txt"), "DO_NOT_OVERWRITE").unwrap();
    repo.store
        .insert_target(&SkillTargetRecord {
            id: "t1".to_string(),
            skill_id: "s1".to_string(),
            tool: "test_agent".to_string(),
            target_path: target.to_string_lossy().to_string(),
            mode: "symlink".to_string(),
            status: "ok".to_string(),
            synced_at: Some(1),
            last_error: None,
            source_hash: None,
        })
        .unwrap();

    let result = delete_managed_skills_by_ids(&repo.store, &["s1".to_string()]).unwrap();

    assert_eq!(result.deleted, 1);
    assert!(result.failed.is_empty());
    assert_eq!(
        fs::read_to_string(target.join("mine.txt")).unwrap(),
        "DO_NOT_OVERWRITE",
        "the user's local fork must survive the skill removal"
    );
    assert!(repo.store.get_targets_for_skill("s1").unwrap().is_empty());
}
include!("../skills_version_tests.rs");

#[test]
fn discarded_local_import_sources_remain_usable_and_clear_cached_errors() {
    let repo = test_repo();
    let body = "---\nname: skill-1\n---\nbody\n";
    for source_type in ["local", "import"] {
        for keep_directory in [false, true] {
            insert_local_skill(&repo, "skill-1", body, body);
            let mut skill = repo.store.get_skill_by_id("skill-1").unwrap().unwrap();
            skill.source_type = source_type.into();
            repo.store.upsert_skill(&skill).unwrap();
            let source = Path::new(skill.source_ref.as_deref().unwrap());
            if keep_directory {
                fs::remove_file(source.join("SKILL.md")).unwrap();
                fs::create_dir_all(source.join("scripts")).unwrap();
            } else {
                fs::remove_dir_all(source).unwrap();
            }
            repo.store
                .update_skill_check_state("skill-1", None, "error", Some("INVALID_SKILL_SOURCE"))
                .unwrap();
            let cached = managed_skill_by_id(&repo.store, "skill-1").unwrap();
            assert_eq!(cached.update_status, "local_only");
            assert_eq!(cached.last_check_error, None);
            let checked =
                check_skill_update_internal_with_remote(&repo.store, "skill-1", true, None)
                    .unwrap();
            assert_eq!(checked.update_status, "local_only");
            assert_eq!(checked.last_check_error, None);
            let stored = repo.store.get_skill_by_id("skill-1").unwrap().unwrap();
            assert_eq!(stored.update_status, "local_only");
            assert_eq!(stored.last_check_error, None);
            assert_eq!(
                fs::read_to_string(Path::new(&stored.central_path).join("SKILL.md")).unwrap(),
                body
            );
            repo.store.delete_skill("skill-1").unwrap();
        }
    }
}
