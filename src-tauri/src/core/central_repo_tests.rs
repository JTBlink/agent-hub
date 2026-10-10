use super::migration::*;
#[test]
fn app_identity_paths_are_isolated_from_other_managers() {
    let _guard = test_base_dir_lock();
    let home = tempfile::tempdir().unwrap();
    set_test_home_dir_override(Some(home.path().to_path_buf()));
    let root = home.path().join(".agent-hub");
    assert_eq!(home_base_dir(), root);
    assert_eq!(config_file_path(), root.join("repo-config.json"));
    assert_eq!(default_base_dir(), root);
    assert_eq!(log_dir(), root.join("logs"));
    assert!(!home.path().join(".skills-manager").exists());
    set_test_home_dir_override(None);
}

use super::*;

#[test]
fn old_default_is_no_longer_live_and_custom_libraries_are_unchanged() {
    let _guard = test_base_dir_lock();
    let home = tempfile::tempdir().unwrap();
    set_test_home_dir_override(Some(home.path().to_path_buf()));
    let root = home_base_dir();
    let old = root.join("library");
    fs::create_dir_all(old.join("skills/demo")).unwrap();
    fs::write(old.join("agent-hub.db"), "fixture").unwrap();
    // Legacy layout is no longer recognized — base_dir is the default.
    assert_eq!(live_base_from(&RepoPathConfig::default()), root);
    let custom = home.path().join("custom");
    let configured = RepoPathConfig {
        repo_path: Some(custom.to_string_lossy().into_owned()),
        ..Default::default()
    };
    assert_eq!(live_base_from(&configured), custom);
    set_test_home_dir_override(None);
}

// ── migrate_repo_if_needed (#252) ──

fn config_migrating(source: &Path, target: &Path) -> RepoPathConfig {
    RepoPathConfig {
        repo_path: Some(target.to_string_lossy().to_string()),
        pending_migration_from: Some(source.to_string_lossy().to_string()),
        ..Default::default()
    }
}

#[test]
fn migration_into_empty_target_moves_and_clears_marker() {
    let src = tempfile::tempdir().unwrap();
    let dst = tempfile::tempdir().unwrap(); // exists but empty
    fs::create_dir_all(src.path().join("skills")).unwrap();
    fs::write(src.path().join("skills/s.md"), b"skill").unwrap();

    let mut config = config_migrating(src.path(), dst.path());
    let outcome = migrate_repo_if_needed(&mut config, dst.path());

    assert!(matches!(outcome, MigrationOutcome::Proceed));
    assert_eq!(config.pending_migration_from, None);
    assert_eq!(fs::read(dst.path().join("skills/s.md")).unwrap(), b"skill");
}

#[test]
fn live_base_is_the_move_source_until_the_move_happens() {
    // Saving a new path must not switch the running session: everything
    // it wrote would land in the target and block the move at the next
    // launch (#449 #469 #393).
    let src = tempfile::tempdir().unwrap();
    let dst = tempfile::tempdir().unwrap();
    let config = config_migrating(src.path(), &dst.path().join("lib"));
    assert_eq!(
        live_base_from(&config),
        normalize_path(&src.path().to_string_lossy()).unwrap()
    );
    assert_eq!(
        requested_base_from(&config),
        normalize_path(&dst.path().join("lib").to_string_lossy()).unwrap()
    );

    // Once the source is gone (moved), the requested location is live.
    let moved = config_migrating(&src.path().join("gone"), &dst.path().join("lib"));
    assert_eq!(live_base_from(&moved), requested_base_from(&moved));
}

#[test]
fn migration_clears_regenerable_leftovers_and_records_repoint() {
    // What an earlier session and the CLI bridge leave in a target: a
    // lock file, empty skeleton dirs, OS metadata, the bridge's `bin/`.
    let _guard = test_base_dir_lock();
    let src = tempfile::tempdir().unwrap();
    let home = tempfile::tempdir().unwrap();
    set_test_home_dir_override(Some(home.path().to_path_buf()));
    let dst = home_base_dir(); // moving back to the default home
    fs::write(src.path().join("a.txt"), b"src").unwrap();
    fs::create_dir_all(&dst).unwrap();
    fs::write(dst.join(".agent-hub.lock"), b"pid=1").unwrap();
    fs::write(dst.join(".DS_Store"), b"").unwrap();
    fs::create_dir_all(dst.join("skills")).unwrap();
    fs::create_dir_all(dst.join("cache/repos")).unwrap();
    let bridge = super::super::cli_bridge::bridge_path();
    fs::create_dir_all(bridge.parent().unwrap()).unwrap();
    fs::write(&bridge, b"bin").unwrap();
    fs::write(bridge.with_file_name(".version"), b"1.0").unwrap();

    let mut config = config_migrating(src.path(), &dst);
    let outcome = migrate_repo_if_needed(&mut config, &dst);
    set_test_home_dir_override(None);

    assert!(matches!(outcome, MigrationOutcome::Proceed));
    assert_eq!(config.pending_migration_from, None);
    assert!(config.repoint_from.is_some());
    assert_eq!(fs::read(dst.join("a.txt")).unwrap(), b"src");
}

#[test]
fn app_file_names_count_as_debris_only_at_the_target_root() {
    let src = tempfile::tempdir().unwrap();
    let dst = tempfile::tempdir().unwrap();
    fs::write(src.path().join("a.txt"), b"src").unwrap();
    fs::create_dir_all(dst.path().join("tools")).unwrap();
    fs::write(dst.path().join("tools/git-askpass.sh"), b"mine").unwrap();

    let mut config = config_migrating(src.path(), dst.path());
    let outcome = migrate_repo_if_needed(&mut config, dst.path());

    assert!(matches!(outcome, MigrationOutcome::UseSource));
    assert!(dst.path().join("tools/git-askpass.sh").exists());
}

#[test]
fn move_by_copy_sets_the_old_copy_aside() {
    let tmp = tempfile::tempdir().unwrap();
    let src = tmp.path().join("lib");
    let dst = tmp.path().join("new");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("a.txt"), b"src").unwrap();

    move_by_copy(&src, &dst).unwrap();

    assert_eq!(fs::read(dst.join("a.txt")).unwrap(), b"src");
    assert!(!src.exists(), "the path is free to move back to");
    let aside: Vec<_> = fs::read_dir(tmp.path())
        .unwrap()
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with("lib.moved-"))
        .collect();
    assert_eq!(aside.len(), 1, "the old copy is kept");
}

#[test]
#[cfg(unix)]
fn move_by_copy_failure_leaves_the_target_empty() {
    use std::os::unix::fs::PermissionsExt;
    let tmp = tempfile::tempdir().unwrap();
    let src = tmp.path().join("lib");
    let dst = tmp.path().join("new");
    fs::create_dir_all(src.join("a")).unwrap();
    fs::write(src.join("a/ok.txt"), b"x").unwrap();
    fs::write(src.join("z-unreadable"), b"x").unwrap();
    fs::set_permissions(src.join("z-unreadable"), fs::Permissions::from_mode(0o000)).unwrap();
    if fs::read(src.join("z-unreadable")).is_ok() {
        return; // running as root: can't provoke the failure
    }

    assert!(move_by_copy(&src, &dst).is_err());

    assert!(
        !directory_has_entries(&dst).unwrap(),
        "retry must see an empty target"
    );
    assert!(src.join("a/ok.txt").exists(), "source untouched");
    fs::set_permissions(src.join("z-unreadable"), fs::Permissions::from_mode(0o644)).unwrap();
}

#[test]
fn a_bin_dir_outside_the_default_home_is_not_debris() {
    // Only the default home's `bin/` holds the bridge; elsewhere a file
    // with the bridge's name is the user's.
    let src = tempfile::tempdir().unwrap();
    let dst = tempfile::tempdir().unwrap();
    fs::write(src.path().join("a.txt"), b"src").unwrap();
    fs::create_dir_all(dst.path().join("bin")).unwrap();
    fs::write(dst.path().join("bin/agent-hub-cli"), b"mine").unwrap();

    let mut config = config_migrating(src.path(), dst.path());
    let outcome = migrate_repo_if_needed(&mut config, dst.path());

    assert!(matches!(outcome, MigrationOutcome::UseSource));
    assert!(dst.path().join("bin/agent-hub-cli").exists());
}

#[test]
fn a_move_that_finished_unrecorded_still_repoints() {
    // Crash (or failed config save) right after the rename: the source is
    // gone, the target holds the library, the marker is still pending.
    let dst = tempfile::tempdir().unwrap();
    let gone = dst.path().join("moved-away");
    let mut config = config_migrating(&gone, dst.path());

    let outcome = migrate_repo_if_needed(&mut config, dst.path());

    assert!(matches!(outcome, MigrationOutcome::Proceed));
    assert_eq!(config.pending_migration_from, None);
    assert_eq!(
        config.repoint_from.as_deref(),
        Some(gone.to_string_lossy().as_ref())
    );
}

#[test]
fn migration_leaves_a_target_with_real_content_untouched() {
    // One real file among the leftovers: nothing is removed.
    let src = tempfile::tempdir().unwrap();
    let dst = tempfile::tempdir().unwrap();
    fs::write(src.path().join("a.txt"), b"src").unwrap();
    fs::write(dst.path().join(".agent-hub.lock"), b"").unwrap();
    fs::create_dir_all(dst.path().join("skills/mine")).unwrap();
    fs::write(dst.path().join("skills/mine/SKILL.md"), b"x").unwrap();

    let mut config = config_migrating(src.path(), dst.path());
    let outcome = migrate_repo_if_needed(&mut config, dst.path());

    assert!(matches!(outcome, MigrationOutcome::UseSource));
    assert!(dst.path().join(".agent-hub.lock").exists());
    assert!(dst.path().join("skills/mine/SKILL.md").exists());
    assert_eq!(config.repoint_from, None);
}

#[test]
#[cfg(unix)]
fn migration_does_not_follow_a_link_disguised_as_a_skeleton_dir() {
    let src = tempfile::tempdir().unwrap();
    let dst = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::write(src.path().join("a.txt"), b"src").unwrap();
    std::os::unix::fs::symlink(outside.path(), dst.path().join("skills")).unwrap();

    let mut config = config_migrating(src.path(), dst.path());
    let outcome = migrate_repo_if_needed(&mut config, dst.path());

    assert!(matches!(outcome, MigrationOutcome::UseSource));
    assert!(outside.path().exists());
}

#[test]
#[cfg(unix)]
fn copy_dir_recursive_keeps_links_as_links() {
    let src = tempfile::tempdir().unwrap();
    let dst = tempfile::tempdir().unwrap();
    fs::create_dir_all(src.path().join("real")).unwrap();
    fs::write(src.path().join("real/f"), b"x").unwrap();
    std::os::unix::fs::symlink("real", src.path().join("dir-link")).unwrap();
    std::os::unix::fs::symlink("real/f", src.path().join("file-link")).unwrap();

    copy_dir_recursive(src.path(), &dst.path().join("out")).unwrap();

    let out = dst.path().join("out");
    assert_eq!(
        fs::read_link(out.join("dir-link")).unwrap(),
        Path::new("real")
    );
    assert_eq!(
        fs::read_link(out.join("file-link")).unwrap(),
        Path::new("real/f")
    );
}

#[test]
fn migration_into_nonempty_target_keeps_source_and_marker() {
    // The whole point of #252's safety: never blind-merge over a
    // non-empty target (real data or failed-attempt debris we can't tell
    // apart). Fall back to the intact source and keep retrying.
    let src = tempfile::tempdir().unwrap();
    let dst = tempfile::tempdir().unwrap();
    fs::write(src.path().join("a.txt"), b"src").unwrap();
    fs::write(dst.path().join("existing.txt"), b"dst-data").unwrap();

    let mut config = config_migrating(src.path(), dst.path());
    let outcome = migrate_repo_if_needed(&mut config, dst.path());

    assert!(matches!(outcome, MigrationOutcome::UseSource));
    assert_eq!(
        live_base_from(&config),
        normalize_path(&src.path().to_string_lossy()).unwrap()
    );
    assert!(
        config.pending_migration_from.is_some(),
        "marker kept for retry"
    );
    assert_eq!(
        fs::read(dst.path().join("existing.txt")).unwrap(),
        b"dst-data"
    );
    assert_eq!(fs::read(src.path().join("a.txt")).unwrap(), b"src");
}

#[test]
#[cfg(unix)]
fn migration_same_dir_via_symlink_clears_marker() {
    // A cosmetic path difference that resolves to the same directory (here
    // a symlink; on Windows, case / 8.3 names) must not be mistaken for a
    // real relocation — otherwise it loops forever on `migration_incomplete`
    // telling the user to empty their own library.
    let real = tempfile::tempdir().unwrap();
    fs::create_dir_all(real.path().join("skills")).unwrap();
    let link_parent = tempfile::tempdir().unwrap();
    let link = link_parent.path().join("aliased");
    std::os::unix::fs::symlink(real.path(), &link).unwrap();

    let mut config = config_migrating(real.path(), &link);
    let outcome = migrate_repo_if_needed(&mut config, &link);

    assert!(matches!(outcome, MigrationOutcome::Proceed));
    assert_eq!(
        config.pending_migration_from, None,
        "same-dir move clears marker"
    );
    // The real library is untouched.
    assert!(real.path().join("skills").exists());
}

#[test]
fn migration_with_missing_source_clears_marker() {
    let dst = tempfile::tempdir().unwrap();
    let missing = dst.path().join("does-not-exist");
    let mut config = config_migrating(&missing, dst.path());

    let outcome = migrate_repo_if_needed(&mut config, dst.path());
    assert!(matches!(outcome, MigrationOutcome::Proceed));
    assert_eq!(config.pending_migration_from, None);
}

#[test]
fn no_pending_migration_is_a_noop() {
    let dst = tempfile::tempdir().unwrap();
    let mut config = RepoPathConfig {
        repo_path: Some(dst.path().to_string_lossy().to_string()),
        pending_migration_from: None,
        ..Default::default()
    };
    let outcome = migrate_repo_if_needed(&mut config, dst.path());
    assert!(matches!(outcome, MigrationOutcome::Proceed));
    assert_eq!(config.pending_migration_from, None);
}

#[test]
fn copy_dir_recursive_copies_read_only_source_files() {
    // git pack files (.idx/.pack/.rev) are read-only. Copying them into a
    // fresh target must succeed — the #252 brick only happened when
    // OVERWRITING an existing read-only file, which migration now avoids by
    // only ever moving into an empty target.
    let src = tempfile::tempdir().unwrap();
    let dst = tempfile::tempdir().unwrap();
    let pack = src.path().join("pack.idx");
    fs::write(&pack, b"packdata").unwrap();
    let mut perms = fs::metadata(&pack).unwrap().permissions();
    perms.set_readonly(true);
    fs::set_permissions(&pack, perms).unwrap();

    let target = dst.path().join("out");
    copy_dir_recursive(src.path(), &target).unwrap();
    assert_eq!(fs::read(target.join("pack.idx")).unwrap(), b"packdata");
}

// ── load_config_state_from ──

#[test]
fn config_state_missing_file_is_missing() {
    let tmp = tempfile::tempdir().unwrap();
    let state = load_config_state_from(&tmp.path().join("repo-config.json"));
    assert!(matches!(state, ConfigState::Missing));
}

#[test]
fn config_state_valid_json_is_valid() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("repo-config.json");
    fs::write(
        &path,
        r#"{ "repo_path": "/tmp/lib", "pending_migration_from": null }"#,
    )
    .unwrap();
    match load_config_state_from(&path) {
        ConfigState::Valid(config) => {
            assert_eq!(config.repo_path.as_deref(), Some("/tmp/lib"));
        }
        other => panic!("expected Valid, got {other:?}"),
    }
}

#[test]
fn config_state_corrupt_json_is_invalid_not_fresh_install() {
    // A corrupt config must never be treated like a missing one — that is
    // the "library rebuilt empty, all skills lost" failure mode (#228).
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("repo-config.json");
    fs::write(&path, "{ not json").unwrap();
    let state = load_config_state_from(&path);
    assert!(matches!(state, ConfigState::Invalid(_)), "{state:?}");
}

#[test]
fn external_base_dir_lives_under_default_base_external() {
    let dir = external_base_dir(Path::new("/tmp/some/my-skills"));
    let prefix = default_base_dir().join("external");
    assert!(
        dir.starts_with(&prefix),
        "expected {} to start with {}",
        dir.display(),
        prefix.display()
    );
}

#[test]
fn external_base_dir_is_stable_for_same_path() {
    let a = external_base_dir(Path::new("/tmp/some/my-skills"));
    let b = external_base_dir(Path::new("/tmp/some/my-skills"));
    assert_eq!(a, b);
}

#[test]
fn external_base_dir_differs_for_different_paths() {
    let a = external_base_dir(Path::new("/tmp/one/my-skills"));
    let b = external_base_dir(Path::new("/tmp/two/my-skills"));
    assert_ne!(a, b);
}

#[test]
fn external_base_dir_does_not_pollute_skills_root_or_its_parent() {
    let skills_root = Path::new("/tmp/external-test/my-skills");
    let dir = external_base_dir(skills_root);
    assert!(!dir.starts_with(skills_root));
    assert!(!dir.starts_with(skills_root.parent().unwrap()));
}

#[test]
fn sanitize_dir_name_replaces_unsafe_characters() {
    assert_eq!(sanitize_dir_name("my skills"), "my-skills");
    assert_eq!(sanitize_dir_name("a/b\\c:d"), "a-b-c-d");
    assert_eq!(sanitize_dir_name(""), "external");
}

#[test]
fn external_base_dir_relative_path_is_stable_against_absolute_form() {
    let _guard = test_base_dir_lock();
    // For a not-yet-existing target, a relative path should namespace the
    // same as its cwd-absolutized form. We simulate by passing both forms
    // and asserting they match.
    let cwd = std::env::current_dir().unwrap();
    let rel = Path::new("nonexistent-skills-target-xyz");
    let abs = cwd.join(rel);
    assert_eq!(external_base_dir(rel), external_base_dir(&abs));
}

#[test]
fn external_base_dir_normalizes_redundant_segments() {
    let _guard = test_base_dir_lock();
    // `./x`, `x`, and `a/../x` should all hash to the same namespace when
    // none of them exist on disk.
    let plain = external_base_dir(Path::new("nonexistent-norm-target"));
    let dot = external_base_dir(Path::new("./nonexistent-norm-target"));
    let parent = external_base_dir(Path::new("a/../nonexistent-norm-target"));
    assert_eq!(plain, dot);
    assert_eq!(plain, parent);
}

#[test]
fn lexically_normalize_handles_basic_cases() {
    assert_eq!(
        lexically_normalize(Path::new("/a/./b/../c")),
        PathBuf::from("/a/c")
    );
    assert_eq!(
        lexically_normalize(Path::new("./a/b")),
        PathBuf::from("a/b")
    );
    assert_eq!(lexically_normalize(Path::new("/..")), PathBuf::from("/"));
}

#[test]
fn default_skills_are_shared_but_database_config_and_logs_stay_in_app_home() {
    let _guard = test_base_dir_lock();
    let temp = tempfile::tempdir().unwrap();
    set_test_home_dir_override(Some(temp.path().into()));
    assert_eq!(skills_dir(), temp.path().join(".agent-hub/skills"));
    assert_eq!(db_path(), temp.path().join(".agent-hub/agent-hub.db"));
    assert_eq!(
        config_file_path(),
        temp.path().join(".agent-hub/repo-config.json")
    );
    assert_eq!(log_dir(), temp.path().join(".agent-hub/logs"));
    // An existing default remains live until the exclusive migration succeeds.
    fs::create_dir_all(home_base_dir().join("skills")).unwrap();
    assert_eq!(skills_dir(), home_base_dir().join("skills"));
    set_test_home_dir_override(None);
}

#[test]
fn custom_and_explicit_cli_roots_remain_compatible() {
    let _guard = test_base_dir_lock();
    let temp = tempfile::tempdir().unwrap();
    set_test_home_dir_override(Some(temp.path().into()));
    let custom = temp.path().join("custom");
    save_config(&RepoPathConfig {
        repo_path: Some(custom.to_string_lossy().into_owned()),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(skills_dir(), custom.join("skills"));
    let explicit = temp.path().join("explicit");
    set_runtime_base_dir_override(Some(explicit.clone()));
    assert_eq!(skills_dir(), explicit.join("skills"));
    set_runtime_skills_dir_override(Some(temp.path().join("checkout")));
    assert_eq!(skills_dir(), temp.path().join("checkout"));
    set_test_base_dir_override(None);
    set_test_home_dir_override(None);
}
