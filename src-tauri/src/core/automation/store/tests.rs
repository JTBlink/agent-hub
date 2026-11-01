use super::*;
#[test]
fn concurrent_writers_are_refused_and_corruption_is_not_overwritten() {
    let temporary = tempfile::tempdir().unwrap();
    let first = Lock::acquire(temporary.path()).unwrap();
    assert!(Lock::acquire(temporary.path()).is_err());
    drop(first);
    assert!(Lock::acquire(temporary.path()).is_ok());
    write(&temporary.path().join("tasks.json"), b"invalid").unwrap();
    assert!(load(temporary.path()).is_err());
}
