use super::*;
use tempfile::tempdir;

#[test]
fn clears_full_and_sparse_slots_but_keeps_unrelated_content_and_lock_files() {
    let root = tempdir().unwrap();
    let slots = [root.path().join("repo"), root.path().join("repo-sparse")];
    for path in &slots {
        std::fs::create_dir(path).unwrap();
    }
    let other = root.path().join("other");
    std::fs::create_dir(&other).unwrap();
    clear_cache_slots(&slots).unwrap();
    assert!(slots
        .iter()
        .all(|path| !path.exists() && path.with_extension("lock").exists()));
    assert!(other.exists());
    clear_cache_slots(&slots).unwrap();
}

#[test]
fn busy_sparse_slot_prevents_partial_cleanup() {
    let root = tempdir().unwrap();
    let slots = [root.path().join("repo"), root.path().join("repo-sparse")];
    for path in &slots {
        std::fs::create_dir(path).unwrap();
    }
    let _lock = lock_repo_cache(&slots[1], &None).unwrap();
    assert!(clear_cache_slots(&slots).is_err());
    assert!(slots.iter().all(|path| path.exists()));
}

#[cfg(unix)]
#[test]
fn clearing_a_cache_symlink_keeps_its_target() {
    let root = tempdir().unwrap();
    let outside = tempdir().unwrap();
    let file = outside.path().join("keep");
    std::fs::write(&file, "content").unwrap();
    let slot = root.path().join("repo");
    std::os::unix::fs::symlink(outside.path(), &slot).unwrap();
    clear_cache_slots(&[slot]).unwrap();
    assert_eq!(std::fs::read_to_string(file).unwrap(), "content");
}
