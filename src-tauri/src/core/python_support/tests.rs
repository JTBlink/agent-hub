use super::*;

#[test]
fn shared_revisions_are_reused_and_old_executions_remain_available() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("runtime/core");
    let old = publish_at(&path, "agent_execution", "revision one").unwrap();
    assert_eq!(
        old,
        publish_at(&path, "agent_execution", "revision one").unwrap()
    );
    let new = publish_at(&path, "agent_execution", "revision two").unwrap();
    assert_ne!(old, new);
    assert_eq!(fs::read_to_string(old).unwrap(), "revision one");
    assert_eq!(fs::read_to_string(new).unwrap(), "revision two");
}

#[test]
fn changed_runtime_is_preserved_and_never_executed() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("runtime/core");
    let module = publish_at(&path, "state_store", "original").unwrap();
    fs::write(&module, "modified").unwrap();
    assert!(publish_at(&path, "state_store", "original").is_err());
    assert_eq!(fs::read_to_string(module).unwrap(), "modified");
}

#[cfg(unix)]
#[test]
fn publishing_refuses_linked_runtime_directories() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::os::unix::fs::symlink(outside.path(), root.path().join("runtime")).unwrap();
    assert!(publish_at(&root.path().join("runtime/core"), "state_store", "source").is_err());
    assert!(!outside.path().join("core").exists());
}
