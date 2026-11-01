use super::*;
use std::fs;
use tempfile::tempdir;

// ── sync_mode_for_tool ──

#[test]
fn sync_mode_defaults_to_symlink() {
    assert!(matches!(
        sync_mode_for_tool("claude-code", None),
        SyncMode::Symlink
    ));
}

#[test]
fn sync_mode_cursor_defaults_to_symlink() {
    assert!(matches!(
        sync_mode_for_tool("cursor", None),
        SyncMode::Symlink
    ));
}

#[test]
fn sync_mode_explicit_copy_overrides_default() {
    assert!(matches!(
        sync_mode_for_tool("claude-code", Some("copy")),
        SyncMode::Copy
    ));
}

#[test]
fn sync_mode_explicit_symlink_overrides_cursor_default() {
    assert!(matches!(
        sync_mode_for_tool("cursor", Some("symlink")),
        SyncMode::Symlink
    ));
}

#[test]
fn sync_mode_unknown_config_falls_back_to_tool_default() {
    assert!(matches!(
        sync_mode_for_tool("cursor", Some("invalid")),
        SyncMode::Symlink
    ));
    assert!(matches!(
        sync_mode_for_tool("claude-code", Some("invalid")),
        SyncMode::Symlink
    ));
}

#[test]
fn sync_mode_as_str() {
    assert_eq!(SyncMode::Symlink.as_str(), "symlink");
    assert_eq!(SyncMode::Copy.as_str(), "copy");
}

#[test]
fn target_dir_name_uses_central_directory_name() {
    let central_path = Path::new("/central/skill123-2");

    assert_eq!(target_dir_name(central_path, "skill123"), "skill123-2");
}

#[test]
fn target_dir_name_falls_back_to_skill_name() {
    assert_eq!(target_dir_name(Path::new(""), "skill123"), "skill123");
}

// ── sync_skill (filesystem) ──

#[test]
fn sync_skill_copy_creates_directory_with_files() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("source");
    let tgt = tmp.path().join("target");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("SKILL.md"), "# hello").unwrap();

    let mode = sync_skill(&src, &tgt, SyncMode::Copy, ReplacePolicy::NoClobber).unwrap();
    assert!(matches!(mode, SyncMode::Copy));
    assert!(tgt.join("SKILL.md").exists());
    assert_eq!(fs::read_to_string(tgt.join("SKILL.md")).unwrap(), "# hello");
}

#[cfg(unix)]
#[test]
fn sync_skill_symlink_creates_symlink() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("source");
    let tgt = tmp.path().join("target");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("SKILL.md"), "# hello").unwrap();

    let mode = sync_skill(&src, &tgt, SyncMode::Symlink, ReplacePolicy::NoClobber).unwrap();
    assert!(matches!(mode, SyncMode::Symlink));
    assert!(tgt.is_symlink());
}

#[cfg(windows)]
#[test]
fn sync_skill_symlink_creates_symlink_on_windows() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("source");
    let tgt = tmp.path().join("target");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("SKILL.md"), "# hello").unwrap();

    let mode = sync_skill(&src, &tgt, SyncMode::Symlink, ReplacePolicy::NoClobber).unwrap();
    assert!(matches!(mode, SyncMode::Symlink));
    assert!(tgt.is_symlink());
}

#[cfg(windows)]
#[test]
fn junction_target_is_recognized_and_removable() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("source");
    let tgt = tmp.path().join("target");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("SKILL.md"), "# hello").unwrap();
    junction::create(&src, &tgt).unwrap();

    // A junction must satisfy the symlink-mode freshness check so
    // later syncs skip instead of re-creating it on every startup.
    assert!(is_target_current(&src, &tgt, SyncMode::Symlink, None, None));
    assert!(tgt.join("SKILL.md").exists());

    // And sync_skill must treat it as already current.
    let mode = sync_skill(&src, &tgt, SyncMode::Symlink, ReplacePolicy::NoClobber).unwrap();
    assert!(matches!(mode, SyncMode::Symlink));

    remove_target(&tgt).unwrap();
    assert!(fs::symlink_metadata(&tgt).is_err());
    assert!(src.join("SKILL.md").exists());
}

#[cfg(windows)]
#[test]
fn remove_target_removes_dangling_junction() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("source");
    let tgt = tmp.path().join("target");
    fs::create_dir_all(&src).unwrap();
    junction::create(&src, &tgt).unwrap();

    // Delete the junction's target so the link dangles.
    fs::remove_dir_all(&src).unwrap();

    remove_target(&tgt).unwrap();
    assert!(fs::symlink_metadata(&tgt).is_err());
}

/// The whole authorization contract in one place. Written out exhaustively
/// so that widening any cell has to be a deliberate edit to this table
/// rather than a side effect of touching `permits`.
#[test]
fn replace_policy_decision_table() {
    use TargetState::*;
    let copy = ReplacePolicy::Recorded { mode: "copy" };
    let link = ReplacePolicy::Recorded { mode: "symlink" };

    for state in [Absent, LinkToSource] {
        // Nothing of the user's exists at the target either way.
        assert!(ReplacePolicy::NoClobber.permits(state), "{state:?}");
        assert!(copy.permits(state), "{state:?}");
        assert!(link.permits(state), "{state:?}");
        assert!(ReplacePolicy::UserConfirmed.permits(state), "{state:?}");
    }

    // A foreign or dangling link is user configuration; only a symlink
    // record (ours, possibly dangling after a library move) or explicit
    // intent may replace it.
    assert!(!ReplacePolicy::NoClobber.permits(ForeignLink));
    assert!(!copy.permits(ForeignLink));
    assert!(link.permits(ForeignLink));
    assert!(ReplacePolicy::UserConfirmed.permits(ForeignLink));

    // A real directory is only ever ours under a copy record.
    assert!(!ReplacePolicy::NoClobber.permits(RealDir));
    assert!(copy.permits(RealDir));
    assert!(!link.permits(RealDir));
    assert!(ReplacePolicy::UserConfirmed.permits(RealDir));

    // We never deploy a bare file, so no record can vouch for one.
    assert!(!ReplacePolicy::NoClobber.permits(RealFile));
    assert!(!copy.permits(RealFile));
    assert!(!link.permits(RealFile));
    assert!(ReplacePolicy::UserConfirmed.permits(RealFile));
}

/// Without a source there is nothing a link can be "ours by pointing at",
/// and `LinkToSource` is permitted by every policy — so an empty path here
/// (which canonicalizes to the process CWD) would hand over a user's link.
#[cfg(unix)]
#[test]
fn classify_target_without_source_never_reports_link_to_source() {
    let tmp = tempdir().unwrap();
    let real = tmp.path().join("real");
    let link = tmp.path().join("link");
    fs::create_dir_all(&real).unwrap();
    std::os::unix::fs::symlink(&real, &link).unwrap();

    assert_eq!(
        classify_target(&link, None).unwrap(),
        TargetState::ForeignLink
    );
}

/// The old contract was "replace whatever is at the target". That is the
/// data loss in #363: an unmanaged directory is not ours to delete, and no
/// record vouches for this one.
#[test]
fn sync_skill_refuses_unmanaged_existing_directory() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("source");
    let tgt = tmp.path().join("target");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("new.md"), "new").unwrap();

    fs::create_dir_all(&tgt).unwrap();
    fs::write(tgt.join("unmanaged.txt"), "DO_NOT_OVERWRITE").unwrap();

    let err = sync_skill(&src, &tgt, SyncMode::Copy, ReplacePolicy::NoClobber).unwrap_err();
    assert!(err.to_string().contains("拒绝替换"), "{err}");
    // Byte-for-byte preservation is the whole point.
    assert_eq!(
        fs::read_to_string(tgt.join("unmanaged.txt")).unwrap(),
        "DO_NOT_OVERWRITE"
    );
    assert!(!tgt.join("new.md").exists());
}

/// A copy-mode row is what makes replacing a real directory legitimate:
/// this is how an ordinary copy-mode re-sync updates its own target.
#[test]
fn sync_skill_replaces_recorded_copy_directory() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("source");
    let tgt = tmp.path().join("target");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("new.md"), "new").unwrap();

    fs::create_dir_all(&tgt).unwrap();
    fs::write(tgt.join("old.md"), "old").unwrap();

    sync_skill(
        &src,
        &tgt,
        SyncMode::Copy,
        ReplacePolicy::Recorded { mode: "copy" },
    )
    .unwrap();
    assert!(tgt.join("new.md").exists());
    assert!(!tgt.join("old.md").exists());
}

/// A row saying "symlink" is evidence about a link, not about the real
/// directory that replaced it. Trusting the row alone would delete content
/// the user put there after our link went away.
#[test]
fn sync_skill_refuses_directory_that_replaced_a_recorded_symlink() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("source");
    let tgt = tmp.path().join("target");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("SKILL.md"), "# hello").unwrap();

    fs::create_dir_all(&tgt).unwrap();
    fs::write(tgt.join("mine.txt"), "user content").unwrap();

    let err = sync_skill(
        &src,
        &tgt,
        SyncMode::Symlink,
        ReplacePolicy::Recorded { mode: "symlink" },
    )
    .unwrap_err();
    assert!(err.to_string().contains("拒绝替换"), "{err}");
    assert_eq!(
        fs::read_to_string(tgt.join("mine.txt")).unwrap(),
        "user content"
    );
}

/// The main "does this break existing users" question. A rebuilt database
/// has no `skill_targets` rows (the metadata snapshot does not carry them),
/// so every already-deployed skill re-syncs with NoClobber. Symlink mode —
/// the default — must stay fine, because the link already points at the
/// source and nothing has to be destroyed.
#[cfg(unix)]
#[test]
fn sync_skill_noclobber_accepts_our_own_existing_link_without_a_record() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("source");
    let tgt = tmp.path().join("target");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("SKILL.md"), "# hello").unwrap();
    std::os::unix::fs::symlink(&src, &tgt).unwrap();

    assert_eq!(
        classify_target(&tgt, Some(&src)).unwrap(),
        TargetState::LinkToSource
    );
    let mode = sync_skill(&src, &tgt, SyncMode::Symlink, ReplacePolicy::NoClobber).unwrap();
    assert!(matches!(mode, SyncMode::Symlink));
    assert_eq!(fs::read_link(&tgt).unwrap(), src);
}

/// Adoption and `--force` are the escape hatch, and they must actually work
/// or the refusal above would be a dead end.
#[test]
fn sync_skill_user_confirmed_replaces_unmanaged_directory() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("source");
    let tgt = tmp.path().join("target");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("new.md"), "new").unwrap();

    fs::create_dir_all(&tgt).unwrap();
    fs::write(tgt.join("old.md"), "old").unwrap();

    sync_skill(&src, &tgt, SyncMode::Copy, ReplacePolicy::UserConfirmed).unwrap();
    assert!(tgt.join("new.md").exists());
    assert!(!tgt.join("old.md").exists());
}

#[test]
fn sync_skill_refuses_unmanaged_existing_file() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("source");
    let tgt = tmp.path().join("target");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("SKILL.md"), "# hello").unwrap();
    fs::write(&tgt, "user file").unwrap();

    // Not even a matching record can vouch for a bare file.
    for policy in [
        ReplacePolicy::NoClobber,
        ReplacePolicy::Recorded { mode: "copy" },
        ReplacePolicy::Recorded { mode: "symlink" },
    ] {
        let err = sync_skill(&src, &tgt, SyncMode::Copy, policy).unwrap_err();
        assert!(err.to_string().contains("拒绝替换"), "{err}");
    }
    assert_eq!(fs::read_to_string(&tgt).unwrap(), "user file");
}

#[cfg(unix)]
#[test]
fn sync_skill_refuses_foreign_symlink_and_keeps_its_pointee() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("source");
    let elsewhere = tmp.path().join("elsewhere");
    let tgt = tmp.path().join("target");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("SKILL.md"), "# hello").unwrap();
    fs::create_dir_all(&elsewhere).unwrap();
    fs::write(elsewhere.join("mine.md"), "user content").unwrap();
    std::os::unix::fs::symlink(&elsewhere, &tgt).unwrap();

    let err = sync_skill(&src, &tgt, SyncMode::Symlink, ReplacePolicy::NoClobber).unwrap_err();
    assert!(err.to_string().contains("拒绝替换"), "{err}");
    assert_eq!(fs::read_link(&tgt).unwrap(), elsewhere);
    assert!(elsewhere.join("mine.md").exists());
}

/// A link with nothing behind it is still the user's configuration, so
/// NoClobber leaves it alone — but our own record may replace it, which is
/// what happens after the library moves and our links dangle.
#[cfg(unix)]
#[test]
fn sync_skill_dangling_link_refused_unmanaged_replaced_when_recorded() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("source");
    let gone = tmp.path().join("gone");
    let tgt = tmp.path().join("target");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("SKILL.md"), "# hello").unwrap();
    std::os::unix::fs::symlink(&gone, &tgt).unwrap();

    let err = sync_skill(&src, &tgt, SyncMode::Symlink, ReplacePolicy::NoClobber).unwrap_err();
    assert!(err.to_string().contains("拒绝替换"), "{err}");

    sync_skill(
        &src,
        &tgt,
        SyncMode::Symlink,
        ReplacePolicy::Recorded { mode: "symlink" },
    )
    .unwrap();
    assert_eq!(fs::read_link(&tgt).unwrap(), src);
}

/// Switching an already-deployed skill from symlink to copy used to fail:
/// `ensure_dst_not_inside_src` canonicalized our own link back to the
/// source and called it infinite recursion.
#[cfg(unix)]
#[test]
fn sync_skill_switches_own_link_to_copy_mode() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("source");
    let tgt = tmp.path().join("target");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("SKILL.md"), "# hello").unwrap();
    std::os::unix::fs::symlink(&src, &tgt).unwrap();

    let mode = sync_skill(&src, &tgt, SyncMode::Copy, ReplacePolicy::NoClobber).unwrap();
    assert!(matches!(mode, SyncMode::Copy));
    assert!(!tgt.is_symlink());
    assert_eq!(fs::read_to_string(tgt.join("SKILL.md")).unwrap(), "# hello");
    // The source must survive having its own link removed.
    assert!(src.join("SKILL.md").exists());
}

/// The classify-then-remove sequence must not degrade into "delete whatever
/// is there now" if the object changes type in between.
#[test]
fn remove_classified_target_will_not_delete_a_directory_it_classified_as_a_link() {
    let tmp = tempdir().unwrap();
    let swapped = tmp.path().join("swapped");
    fs::create_dir_all(&swapped).unwrap();
    fs::write(swapped.join("precious.txt"), "data").unwrap();

    // Classified as a link earlier; a real directory is there now.
    let err = remove_classified_target(&swapped, TargetState::ForeignLink).unwrap_err();
    assert!(swapped.join("precious.txt").exists(), "{err}");
}

#[test]
fn remove_recorded_target_preserves_content_that_replaced_a_link() {
    let tmp = tempdir().unwrap();
    let path = tmp.path().join("target");
    fs::create_dir_all(&path).unwrap();
    fs::write(path.join("mine.txt"), "user content").unwrap();

    // Row says we deployed a symlink; a real directory is there now.
    assert!(!remove_recorded_target(&path, "symlink").unwrap());
    assert_eq!(
        fs::read_to_string(path.join("mine.txt")).unwrap(),
        "user content"
    );

    // A copy row does authorize removing its own directory.
    assert!(remove_recorded_target(&path, "copy").unwrap());
    assert!(!path.exists());
}

#[cfg(unix)]
#[test]
fn sync_skill_symlink_skips_existing_correct_link() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("source");
    let tgt = tmp.path().join("target");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("SKILL.md"), "# hello").unwrap();
    std::os::unix::fs::symlink(&src, &tgt).unwrap();

    let before = fs::symlink_metadata(&tgt).unwrap().modified().unwrap();
    let mode = sync_skill(&src, &tgt, SyncMode::Symlink, ReplacePolicy::NoClobber).unwrap();

    assert!(matches!(mode, SyncMode::Symlink));
    assert_eq!(fs::read_link(&tgt).unwrap(), src);
    assert_eq!(
        fs::symlink_metadata(&tgt).unwrap().modified().unwrap(),
        before
    );
}

// ── copy_dir_recursive ──

#[test]
fn copy_dir_recursive_skips_dot_git() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("src");
    fs::create_dir_all(src.join(".git")).unwrap();
    fs::write(src.join(".git/config"), "git config").unwrap();
    fs::create_dir_all(src.join("subdir")).unwrap();
    fs::write(src.join("subdir/file.md"), "content").unwrap();
    fs::write(src.join("root.md"), "root").unwrap();

    let dst = tmp.path().join("dst");
    copy_dir_recursive(&src, &dst).unwrap();

    assert!(!dst.join(".git").exists());
    assert!(dst.join("subdir/file.md").exists());
    assert!(dst.join("root.md").exists());
}

// ── ensure_dst_not_inside_src ──

#[test]
fn ensure_dst_not_inside_src_rejects_subdirectory() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("skills");
    fs::create_dir_all(&src).unwrap();
    let dst = src.join("skills");

    let err = ensure_dst_not_inside_src(&src, &dst).unwrap_err();
    assert!(err.to_string().contains("infinite recursion"), "{err}");
}

#[test]
fn ensure_dst_not_inside_src_rejects_same_path() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("skills");
    fs::create_dir_all(&src).unwrap();

    // Still rejected, now by the explicit same-path guard that runs before
    // the containment checks (it is what catches src == dst when both are
    // the same symlink, where lexical/canonical forms differ).
    let err = ensure_dst_not_inside_src(&src, &src).unwrap_err();
    assert!(err.to_string().contains("same path"), "{err}");
}

/// The symlink case the lexical-dst change opened up: unlinking `dst` would
/// destroy `src`, and the copy would then "succeed" from the empty
/// directory it created in its place.
#[cfg(unix)]
#[test]
fn sync_skill_refuses_when_source_and_target_are_the_same_link() {
    let tmp = tempdir().unwrap();
    let real = tmp.path().join("real");
    let link = tmp.path().join("link");
    fs::create_dir_all(&real).unwrap();
    fs::write(real.join("SKILL.md"), "# hello").unwrap();
    std::os::unix::fs::symlink(&real, &link).unwrap();

    let err = sync_skill(&link, &link, SyncMode::Copy, ReplacePolicy::UserConfirmed).unwrap_err();
    assert!(err.to_string().contains("same path"), "{err}");
    // The link and everything behind it must survive.
    assert!(link.is_symlink());
    assert!(real.join("SKILL.md").exists());

    // Two spellings of that same link must also be caught. `..` is used
    // rather than `.` because Rust's path comparison already normalizes a
    // non-leading `.` away, so `tmp/./link == tmp/link` would exit through
    // the plain `src == dst` guard and never reach the lexical comparison.
    let aliased = tmp.path().join("real").join("..").join("link");
    assert_ne!(aliased, link, "alias must not be trivially equal");
    let err = sync_skill(
        &aliased,
        &link,
        SyncMode::Copy,
        ReplacePolicy::UserConfirmed,
    )
    .unwrap_err();
    assert!(err.to_string().contains("same path"), "{err}");
    assert!(link.is_symlink());
    assert!(real.join("SKILL.md").exists());
}

#[test]
fn ensure_dst_not_inside_src_allows_disjoint_paths() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("skills");
    let dst = tmp.path().join("other").join("skills");
    fs::create_dir_all(&src).unwrap();
    fs::create_dir_all(dst.parent().unwrap()).unwrap();

    ensure_dst_not_inside_src(&src, &dst).unwrap();
}

#[test]
fn ensure_dst_not_inside_src_allows_sibling_dst() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("skills");
    let dst = tmp.path().join("skills-disabled");
    fs::create_dir_all(&src).unwrap();

    ensure_dst_not_inside_src(&src, &dst).unwrap();
}

#[test]
fn ensure_dst_not_inside_src_rejects_missing_source() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("does-not-exist");
    let dst = tmp.path().join("target");
    fs::create_dir_all(&dst).unwrap();

    let err = ensure_dst_not_inside_src(&src, &dst).unwrap_err();
    assert!(err.to_string().contains("not accessible"), "{err}");
}

#[test]
fn ensure_dst_not_inside_src_rejects_source_inside_destination() {
    let tmp = tempdir().unwrap();
    let dst = tmp.path().join("skills");
    let src = dst.join("nested");
    fs::create_dir_all(&src).unwrap();

    let err = ensure_dst_not_inside_src(&src, &dst).unwrap_err();
    assert!(err.to_string().contains("deleting the source"), "{err}");
}

#[cfg(unix)]
#[test]
fn ensure_dst_not_inside_src_rejects_dangling_symlink_source() {
    // A dangling symlink source used to slip past the guard (canonicalize
    // failure returned Ok) and let the caller delete the destination
    // before the copy inevitably failed (#199 hardening).
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("dangling");
    std::os::unix::fs::symlink(tmp.path().join("gone"), &src).unwrap();
    let dst = tmp.path().join("target");
    fs::create_dir_all(&dst).unwrap();

    let err = ensure_dst_not_inside_src(&src, &dst).unwrap_err();
    assert!(err.to_string().contains("not accessible"), "{err}");
}

#[test]
fn sync_skill_refuses_target_inside_source() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("skills");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("SKILL.md"), "# hello").unwrap();
    let tgt = src.join("skills");

    let err = sync_skill(&src, &tgt, SyncMode::Copy, ReplacePolicy::NoClobber).unwrap_err();
    assert!(err.to_string().contains("infinite recursion"), "{err}");
    // Source must be untouched after the rejection.
    assert!(src.join("SKILL.md").exists());
}

// ── remove_target ──

#[test]
fn remove_target_removes_directory() {
    let tmp = tempdir().unwrap();
    let dir = tmp.path().join("to_remove");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("file.txt"), "data").unwrap();

    remove_target(&dir).unwrap();
    assert!(!dir.exists());
}

#[test]
fn remove_target_removes_file() {
    let tmp = tempdir().unwrap();
    let file = tmp.path().join("file.txt");
    fs::write(&file, "data").unwrap();

    remove_target(&file).unwrap();
    assert!(!file.exists());
}

#[cfg(unix)]
#[test]
fn remove_target_removes_symlink() {
    let tmp = tempdir().unwrap();
    let real = tmp.path().join("real");
    fs::create_dir_all(&real).unwrap();
    let link = tmp.path().join("link");
    std::os::unix::fs::symlink(&real, &link).unwrap();

    remove_target(&link).unwrap();
    assert!(!link.exists());
    assert!(real.exists()); // original untouched
}

#[cfg(windows)]
#[test]
fn remove_target_removes_directory_symlink() {
    let tmp = tempdir().unwrap();
    let real = tmp.path().join("real");
    fs::create_dir_all(&real).unwrap();
    fs::write(real.join("SKILL.md"), "# hello").unwrap();
    let link = tmp.path().join("link");
    std::os::windows::fs::symlink_dir(&real, &link).unwrap();

    remove_target(&link).unwrap();
    assert!(!link.exists());
    assert!(real.exists());
    assert!(real.join("SKILL.md").exists());
}

#[test]
fn remove_target_nonexistent_is_ok() {
    let tmp = tempdir().unwrap();
    let path = tmp.path().join("does_not_exist");
    assert!(remove_target(&path).is_ok());
}

// ── is_target_current copy-mode freshness (issue #153) ──

#[test]
fn is_target_current_copy_skips_when_hashes_match_and_target_exists() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("source");
    let tgt = tmp.path().join("target");
    fs::create_dir_all(&tgt).unwrap();
    assert!(is_target_current(
        &src,
        &tgt,
        SyncMode::Copy,
        Some("hash-abc"),
        Some("hash-abc"),
    ));
}

#[test]
fn is_target_current_copy_resyncs_when_target_missing_even_if_hashes_match() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("source");
    let tgt = tmp.path().join("target-that-was-deleted");
    // User deleted the synced directory manually; we must re-copy.
    assert!(!is_target_current(
        &src,
        &tgt,
        SyncMode::Copy,
        Some("hash-abc"),
        Some("hash-abc"),
    ));
}

#[test]
fn is_target_current_copy_resyncs_when_hashes_differ() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("source");
    let tgt = tmp.path().join("target");
    fs::create_dir_all(&tgt).unwrap();
    assert!(!is_target_current(
        &src,
        &tgt,
        SyncMode::Copy,
        Some("hash-old"),
        Some("hash-new"),
    ));
}

#[test]
fn is_target_current_copy_resyncs_when_either_hash_missing() {
    let tmp = tempdir().unwrap();
    let src = tmp.path().join("source");
    let tgt = tmp.path().join("target");
    fs::create_dir_all(&tgt).unwrap();
    // No previously recorded hash → must resync (e.g. row predates v6).
    assert!(!is_target_current(
        &src,
        &tgt,
        SyncMode::Copy,
        None,
        Some("hash-abc"),
    ));
    // Source has no current hash → must resync (defensive).
    assert!(!is_target_current(
        &src,
        &tgt,
        SyncMode::Copy,
        Some("hash-abc"),
        None,
    ));
    // Both missing → must resync.
    assert!(!is_target_current(&src, &tgt, SyncMode::Copy, None, None));
}
