use super::*;

#[test]
fn busy_slot_is_rejected_until_its_operation_completes() {
    let root = tempfile::tempdir().unwrap();
    let slot = root.path().join("repo");
    let guard = RepoCacheLock::try_acquire(&slot).unwrap();
    assert!(RepoCacheLock::try_acquire(&slot).is_err());
    drop(guard);
    assert!(RepoCacheLock::try_acquire(&slot).is_ok());
}

#[cfg(unix)]
#[test]
fn releasing_cache_lock_does_not_wait_for_a_duplicated_handle_to_close() {
    let root = tempfile::tempdir().unwrap();
    let slot = root.path().join("repo");
    let guard = lock_repo_cache(&slot, &None).unwrap();
    // Model an open file description inherited by a concurrently spawned child.
    let inherited = guard.file.try_clone().unwrap();
    drop(guard);

    let probe = open_lock_file(&slot).unwrap();
    probe
        .try_lock_exclusive()
        .expect("the completed operation must release its cache lock");
    FileExt::unlock(&probe).unwrap();
    drop(inherited);
}
