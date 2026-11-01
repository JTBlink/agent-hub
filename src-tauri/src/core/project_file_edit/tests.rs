use super::*;
#[test]
fn saves_only_unchanged_existing_text_within_the_worktree() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::write(temp.path().join("demo.rs"), "old\r\n").unwrap();
    save(temp.path(), "demo.rs", "old\r\n", "new\r\n").unwrap();
    assert_eq!(
        std::fs::read_to_string(temp.path().join("demo.rs")).unwrap(),
        "new\r\n"
    );
    assert!(save(temp.path(), "demo.rs", "old\r\n", "stale").is_err());
    assert!(save(temp.path(), "../outside", "", "bad").is_err());
    assert!(save(temp.path(), "missing.rs", "", "bad").is_err());
    std::fs::create_dir(temp.path().join(".git")).unwrap();
    std::fs::write(temp.path().join(".git/config"), "metadata").unwrap();
    assert!(save(temp.path(), ".git/config", "metadata", "bad").is_err());
    assert!(save(temp.path(), ".GIT/config", "metadata", "bad").is_err());
    assert_eq!(
        std::fs::read_to_string(temp.path().join("demo.rs")).unwrap(),
        "new\r\n"
    );
}
