use super::*;
use crate::core::central_repo;
use crate::core::skill_store::{SkillRecord, SkillStore, SkillTargetRecord};
use std::fs;
use tempfile::tempdir;

/// Two adapters can point at the same skills directory — `amp` and
/// `replit` both deploy to `~/.config/agents/skills`, and `kimi` did too
/// until it moved to `~/.kimi-code/skills` (#270). When one of them is
/// retargeted, its stale record must be dropped, but the directory the
/// others are still deployed to must survive: it is their live
/// deployment, not this tool's leftover.
#[test]
fn retargeting_one_tool_keeps_a_directory_another_tool_still_claims() {
    let _lock = central_repo::test_base_dir_lock();
    let tmp = tempdir().unwrap();
    let base = tmp.path().join("repo");
    central_repo::set_test_base_dir_override(Some(base.clone()));
    fs::create_dir_all(central_repo::skills_dir()).unwrap();
    let store = SkillStore::new(&base.join("test.db")).unwrap();

    let source = central_repo::skills_dir().join("skill-a");
    fs::create_dir_all(&source).unwrap();
    fs::write(source.join("SKILL.md"), "real source").unwrap();

    // The shared deployment both tools were synced to.
    let shared = tmp.path().join("shared-agents").join("skill-a");
    fs::create_dir_all(&shared).unwrap();
    fs::write(shared.join("SKILL.md"), "real source").unwrap();

    // Where the retargeted tool is moving to.
    let moved = tmp.path().join("kimi-code").join("skill-a");

    let skill = SkillRecord {
        id: "skill-a".to_string(),
        name: "skill-a".to_string(),
        description: None,
        source_type: "import".to_string(),
        source_ref: Some(source.to_string_lossy().to_string()),
        source_ref_resolved: None,
        source_subpath: None,
        source_branch: None,
        source_revision: None,
        source_agent: None,
        remote_revision: None,
        central_path: source.to_string_lossy().to_string(),
        content_hash: Some("h1".to_string()),
        enabled: true,
        created_at: 1,
        updated_at: 1,
        status: "ok".to_string(),
        update_status: "local_only".to_string(),
        last_checked_at: None,
        last_check_error: None,
    };
    store.insert_skill(&skill).unwrap();

    for (id, tool) in [("target-amp", "amp"), ("target-kimi", "kimi")] {
        store
            .insert_target(&SkillTargetRecord {
                id: id.to_string(),
                skill_id: "skill-a".to_string(),
                tool: tool.to_string(),
                target_path: shared.to_string_lossy().to_string(),
                mode: "copy".to_string(),
                status: "ok".to_string(),
                synced_at: Some(1),
                last_error: None,
                source_hash: Some("h1".to_string()),
            })
            .unwrap();
    }

    // Adapter order puts amp before kimi, so amp is skipped as current
    // before kimi reaches its retarget branch.
    let desired = vec![
        ScenarioSyncTarget {
            skill_id: "skill-a".to_string(),
            skill_name: "skill-a".to_string(),
            tool: "amp".to_string(),
            source: source.clone(),
            target: shared.clone(),
            mode: sync_engine::SyncMode::Copy,
            source_hash: Some("h1".to_string()),
        },
        ScenarioSyncTarget {
            skill_id: "skill-a".to_string(),
            skill_name: "skill-a".to_string(),
            tool: "kimi".to_string(),
            source: source.clone(),
            target: moved.clone(),
            mode: sync_engine::SyncMode::Copy,
            source_hash: Some("h1".to_string()),
        },
    ];

    sync_desired_targets(&store, &desired, false).unwrap();

    assert!(
        shared.join("SKILL.md").exists(),
        "amp's live deployment was deleted while retargeting kimi"
    );
    assert!(
        moved.join("SKILL.md").exists(),
        "kimi was not deployed to its new path"
    );

    central_repo::set_test_base_dir_override(None);
}

/// Startup must survive a collision. `ensure_default_startup_scenario`
/// reaches this function through `sync_scenario_skills`, and its caller
/// chain ends at `initialize_store().expect(...)` in lib.rs — so returning
/// `Err` for an ownership refusal panicked the desktop app on launch under
/// exactly the condition #363 exists to handle. The refusal must come back
/// as data, with the user's directory untouched.
#[test]
fn ownership_refusal_is_reported_not_returned_as_error() {
    let _lock = central_repo::test_base_dir_lock();
    let tmp = tempdir().unwrap();
    let base = tmp.path().join("repo");
    central_repo::set_test_base_dir_override(Some(base.clone()));
    fs::create_dir_all(central_repo::skills_dir()).unwrap();
    let store = SkillStore::new(&base.join("test.db")).unwrap();

    let source = central_repo::skills_dir().join("skill-a");
    fs::create_dir_all(&source).unwrap();
    fs::write(source.join("SKILL.md"), "real source").unwrap();

    // An unmanaged directory sitting exactly where we want to deploy.
    let target = tmp.path().join("agent-skills").join("skill-a");
    fs::create_dir_all(&target).unwrap();
    fs::write(target.join("unmanaged.txt"), "DO_NOT_OVERWRITE").unwrap();

    let desired = vec![ScenarioSyncTarget {
        skill_id: "skill-a".to_string(),
        skill_name: "skill-a".to_string(),
        tool: "claude-code".to_string(),
        source,
        target: target.clone(),
        mode: sync_engine::SyncMode::Symlink,
        source_hash: Some("h1".to_string()),
    }];

    let refusals = sync_desired_targets(&store, &desired, false)
        .expect("a refusal must not surface as Err: that panics app startup");
    assert_eq!(refusals.len(), 1, "{refusals:?}");
    assert!(refusals[0].to_string().contains("拒绝替换"), "{refusals:?}");
    // The path must survive as data, not only inside the sentence: an
    // agent driving the CLI has to name the directory that is in the way.
    assert_eq!(refusals[0].target, target);

    // ...and it must still be a path when it reaches the caller's error.
    let err = refusals_to_error(refusals).expect_err("a refusal must become an error here");
    assert_eq!(err.kind, crate::core::error::ErrorKind::TargetConflict);
    match err.details {
        Some(ref details) => {
            assert_eq!(details.conflicts.len(), 1);
            assert_eq!(details.conflicts[0].path, target.display().to_string());
        }
        None => panic!("expected structured target-conflict details"),
    }
    assert_eq!(
        fs::read_to_string(target.join("unmanaged.txt")).unwrap(),
        "DO_NOT_OVERWRITE"
    );

    central_repo::set_test_base_dir_override(None);
}

/// Issue #153 regression: when the existing target was written in
/// Copy mode (Windows symlink fallback) but the configured mode is
/// Symlink, and the source content hash hasn't changed, the sync
/// must be skipped. Prior to the fix the mode-equality guard would
/// reject the skip branch and re-attempt the full recursive copy
/// every startup.
#[test]
fn copy_fallback_target_with_matching_hash_is_skipped() {
    let _lock = central_repo::test_base_dir_lock();
    let tmp = tempdir().unwrap();
    let base = tmp.path().join("repo");
    central_repo::set_test_base_dir_override(Some(base.clone()));
    fs::create_dir_all(central_repo::skills_dir()).unwrap();
    let store = SkillStore::new(&base.join("test.db")).unwrap();

    // Real source dir with one file (the central skill).
    let source = central_repo::skills_dir().join("skill-a");
    fs::create_dir_all(&source).unwrap();
    fs::write(source.join("SKILL.md"), "real source").unwrap();

    // Pre-existing target dir with a marker file that would be wiped
    // by copy_dir_recursive's pre-clean step if a re-sync ran.
    let target = tmp.path().join("agent-skills").join("skill-a");
    fs::create_dir_all(&target).unwrap();
    fs::write(target.join("MARKER.txt"), "do not wipe me").unwrap();

    // DB rows: skill content_hash = "h1"; existing target also at "h1",
    // mode "copy" (i.e. previously fell back from Symlink).
    let skill = SkillRecord {
        id: "skill-a".to_string(),
        name: "skill-a".to_string(),
        description: None,
        source_type: "import".to_string(),
        source_ref: Some(source.to_string_lossy().to_string()),
        source_ref_resolved: None,
        source_subpath: None,
        source_branch: None,
        source_revision: None,
        source_agent: None,
        remote_revision: None,
        central_path: source.to_string_lossy().to_string(),
        content_hash: Some("h1".to_string()),
        enabled: true,
        created_at: 1,
        updated_at: 1,
        status: "ok".to_string(),
        update_status: "local_only".to_string(),
        last_checked_at: None,
        last_check_error: None,
    };
    store.insert_skill(&skill).unwrap();

    store
        .insert_target(&SkillTargetRecord {
            id: "target-1".to_string(),
            skill_id: "skill-a".to_string(),
            tool: "claude-code".to_string(),
            target_path: target.to_string_lossy().to_string(),
            mode: "copy".to_string(),
            status: "ok".to_string(),
            synced_at: Some(1),
            last_error: None,
            source_hash: Some("h1".to_string()),
        })
        .unwrap();

    // Desired target: same source/target/hash but Symlink mode
    // (the configured default that originally fell back to Copy).
    let desired = vec![ScenarioSyncTarget {
        skill_id: "skill-a".to_string(),
        skill_name: "skill-a".to_string(),
        tool: "claude-code".to_string(),
        source: source.clone(),
        target: target.clone(),
        mode: sync_engine::SyncMode::Symlink,
        source_hash: Some("h1".to_string()),
    }];

    sync_desired_targets(&store, &desired, false).unwrap();

    // The marker file proves no re-sync ran (a real re-sync would
    // have called copy_dir_recursive after wiping the target).
    assert!(
        target.join("MARKER.txt").exists(),
        "target dir was wiped — skip did not fire"
    );
    // The skill's actual SKILL.md should NOT have been copied in,
    // because we skipped the sync entirely.
    assert!(
        !target.join("SKILL.md").exists(),
        "SKILL.md appeared — sync ran instead of skipping"
    );

    central_repo::set_test_base_dir_override(None);
}

/// Companion: if the target has been manually deleted, even with a
/// matching hash, we must NOT skip — the user's agent dir is
/// otherwise left broken.
#[test]
fn deleted_target_with_matching_hash_forces_resync() {
    let _lock = central_repo::test_base_dir_lock();
    let tmp = tempdir().unwrap();
    let base = tmp.path().join("repo");
    central_repo::set_test_base_dir_override(Some(base.clone()));
    fs::create_dir_all(central_repo::skills_dir()).unwrap();
    let store = SkillStore::new(&base.join("test.db")).unwrap();

    let source = central_repo::skills_dir().join("skill-b");
    fs::create_dir_all(&source).unwrap();
    fs::write(source.join("SKILL.md"), "real source").unwrap();

    // Target path that does NOT exist on disk.
    let target = tmp.path().join("agent-skills").join("skill-b");

    let skill = SkillRecord {
        id: "skill-b".to_string(),
        name: "skill-b".to_string(),
        description: None,
        source_type: "import".to_string(),
        source_ref: Some(source.to_string_lossy().to_string()),
        source_ref_resolved: None,
        source_subpath: None,
        source_branch: None,
        source_revision: None,
        source_agent: None,
        remote_revision: None,
        central_path: source.to_string_lossy().to_string(),
        content_hash: Some("h1".to_string()),
        enabled: true,
        created_at: 1,
        updated_at: 1,
        status: "ok".to_string(),
        update_status: "local_only".to_string(),
        last_checked_at: None,
        last_check_error: None,
    };
    store.insert_skill(&skill).unwrap();

    store
        .insert_target(&SkillTargetRecord {
            id: "target-2".to_string(),
            skill_id: "skill-b".to_string(),
            tool: "claude-code".to_string(),
            target_path: target.to_string_lossy().to_string(),
            mode: "copy".to_string(),
            status: "ok".to_string(),
            synced_at: Some(1),
            last_error: None,
            source_hash: Some("h1".to_string()),
        })
        .unwrap();

    let desired = vec![ScenarioSyncTarget {
        skill_id: "skill-b".to_string(),
        skill_name: "skill-b".to_string(),
        tool: "claude-code".to_string(),
        source: source.clone(),
        target: target.clone(),
        mode: sync_engine::SyncMode::Copy,
        source_hash: Some("h1".to_string()),
    }];

    sync_desired_targets(&store, &desired, false).unwrap();

    // Sync must have run — target should now exist with the source content.
    assert!(
        target.join("SKILL.md").exists(),
        "missing target was not re-synced"
    );

    central_repo::set_test_base_dir_override(None);
}

/// `canonicalize` resolves through symlinks, but the replacement that
/// follows an adoption does not: a symlinked target is only unlinked, so
/// whatever it pointed at survives. Re-pointing on the resolved path would
/// silently orphan a directory that is still on disk and still the user's
/// source of truth -- later edits in it would never be seen again (#425).
#[cfg(unix)]
#[test]
fn a_symlinked_adoption_target_does_not_detach_the_directory_it_points_at() {
    let _lock = central_repo::test_base_dir_lock();
    let tmp = tempdir().unwrap();
    let base = tmp.path().join("repo");
    central_repo::set_test_base_dir_override(Some(base.clone()));
    fs::create_dir_all(central_repo::skills_dir()).unwrap();
    let store = SkillStore::new(&base.join("test.db")).unwrap();

    let central = central_repo::skills_dir().join("jira");
    fs::create_dir_all(&central).unwrap();
    fs::write(central.join("SKILL.md"), "central copy").unwrap();

    // The folder the skill was imported from: still the user's source.
    let import_src = tmp.path().join("claude").join("skills").join("jira");
    fs::create_dir_all(&import_src).unwrap();
    fs::write(import_src.join("SKILL.md"), "user copy").unwrap();

    // Another agent's skills dir holds a symlink to that same folder.
    let link = tmp.path().join("duo").join("skills").join("jira");
    fs::create_dir_all(link.parent().unwrap()).unwrap();
    std::os::unix::fs::symlink(&import_src, &link).unwrap();

    store
        .insert_skill(&SkillRecord {
            id: "jira".to_string(),
            name: "jira".to_string(),
            description: None,
            source_type: "import".to_string(),
            source_ref: Some(import_src.to_string_lossy().to_string()),
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            source_agent: None,
            remote_revision: None,
            central_path: central.to_string_lossy().to_string(),
            content_hash: Some("h1".to_string()),
            enabled: true,
            created_at: 1,
            updated_at: 1,
            status: "ok".to_string(),
            update_status: "local_only".to_string(),
            last_checked_at: None,
            last_check_error: None,
        })
        .unwrap();

    // Adopting the link must leave the pointee's source_ref alone.
    detach_source_refs_from_adoption_target(&store, &link).unwrap();
    let after = store.get_skill_by_id("jira").unwrap().unwrap();
    assert_eq!(
        after.source_ref.as_deref(),
        Some(import_src.to_string_lossy().as_ref()),
        "a symlinked target detached the real directory it points at"
    );

    // But adopting the real directory still detaches it: that one is
    // about to be replaced by a deployment.
    detach_source_refs_from_adoption_target(&store, &import_src).unwrap();
    let after = store.get_skill_by_id("jira").unwrap().unwrap();
    assert_eq!(
        after.source_ref.as_deref(),
        Some(central.to_string_lossy().as_ref()),
        "adopting the real source dir no longer re-points source_ref"
    );

    central_repo::set_test_base_dir_override(None);
}
