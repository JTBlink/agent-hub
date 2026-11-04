use super::*;

#[test]
fn releasing_guard_unlocks_even_while_a_duplicate_handle_survives() {
    let fixture = super::super::tests::TestProject::new();
    let lock = ProjectLock::acquire(fixture.path()).unwrap();
    assert!(ProjectLock::acquire(fixture.path()).is_err());
    let duplicate = lock.file.try_clone().unwrap();
    drop(lock);
    let next = ProjectLock::acquire(fixture.path())
        .expect("A surviving handle must not extend the transaction guard's lifetime");
    drop(next);
    drop(duplicate);
}
