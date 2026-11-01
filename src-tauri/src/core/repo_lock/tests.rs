use super::*;
use tempfile::tempdir;

/// Regression test for issue #99: the lock file must not live inside
/// `skills_dir`. On Windows, an open exclusive lock on a file inside a
/// directory makes it impossible to rename or remove that directory
/// (Access is denied / os error 5), which broke the clone-with-backup
/// flow used by "use existing remote backup".
#[test]
fn lock_file_lives_outside_skills_dir() {
    let _guard = central_repo::test_base_dir_lock();
    let tmp = tempdir().unwrap();
    let base = tmp.path().join("base");
    central_repo::set_test_base_dir_override(Some(base.clone()));
    let skills_dir = central_repo::skills_dir();
    std::fs::create_dir_all(&skills_dir).unwrap();

    let lock = RepoLock::acquire("test").unwrap();

    assert!(base.join(LOCK_FILE_NAME).exists());
    assert!(!skills_dir.join(LOCK_FILE_NAME).exists());

    let entries: Vec<_> = std::fs::read_dir(&skills_dir).unwrap().collect();
    assert!(
        entries.is_empty(),
        "skills_dir should remain empty while the lock is held; got {entries:?}"
    );

    drop(lock);
    central_repo::set_test_base_dir_override(None);
}

/// The stamp is the only reason the lock file has contents at all, and it
/// is written without an fsync — so pin down that a separate reader still
/// sees it. `File` does no userspace buffering, so the `write` reaches the
/// page cache before `stamp` returns; losing it to a crash would be
/// harmless, but losing it to buffering would silently blank the one clue
/// a "repository is busy" report has.
///
/// Unix only, and not for lack of trying: fs2 locks the whole byte range
/// with `LockFileEx`, whose locks are mandatory on Windows, so *no* handle
/// can read the file while the lock is held — the assertion below cannot be
/// expressed there. Asserting it after the release instead would pass
/// whether or not the write ever reached the file, which is no assertion at
/// all. The same mandatory lock means a Windows operator cannot read the
/// stamp of a live holder either, so there is less to protect.
#[cfg(unix)]
#[test]
fn stamp_is_readable_by_another_handle_while_held() {
    let _guard = central_repo::test_base_dir_lock();
    let tmp = tempdir().unwrap();
    let base = tmp.path().join("base");
    central_repo::set_test_base_dir_override(Some(base.clone()));

    let lock = RepoLock::acquire("diagnosable operation").unwrap();

    let stamped = std::fs::read_to_string(base.join(LOCK_FILE_NAME)).unwrap();
    assert!(
        stamped.contains(&format!("pid={}", std::process::id())),
        "stamp should name the holding process; got {stamped:?}"
    );
    assert!(
        stamped.contains("operation=diagnosable operation"),
        "stamp should name the operation; got {stamped:?}"
    );

    drop(lock);
    central_repo::set_test_base_dir_override(None);
}

/// A blocking acquire must report "busy" only after waiting roughly the
/// requested timeout while another holder keeps the lock, and must succeed
/// once that holder releases. This is the behaviour foreground operations
/// rely on to ride out transient contention with background work.
#[test]
fn blocking_acquire_waits_then_times_out_and_recovers() {
    let _guard = central_repo::test_base_dir_lock();
    let tmp = tempdir().unwrap();
    let base = tmp.path().join("base");
    central_repo::set_test_base_dir_override(Some(base));

    let held = RepoLock::acquire("holder").unwrap();

    let start = Instant::now();
    let busy = RepoLock::acquire_blocking("waiter", Duration::from_millis(300));
    assert!(busy.is_err(), "should time out while the lock is held");
    assert!(
        start.elapsed() >= Duration::from_millis(250),
        "should have waited close to the timeout, waited {:?}",
        start.elapsed()
    );

    drop(held);
    let recovered = RepoLock::acquire_blocking("waiter", Duration::from_millis(300));
    assert!(recovered.is_ok(), "should acquire once the holder releases");
    drop(recovered);

    central_repo::set_test_base_dir_override(None);
}
