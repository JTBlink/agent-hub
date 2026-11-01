use super::*;
#[test]
fn inspects_unborn_repositories_and_untracked_diffs_without_writes() {
    let temp = tempfile::tempdir().unwrap();
    git2::Repository::init(temp.path()).unwrap();
    std::fs::write(temp.path().join("demo.rs"), "fn main() {}\n").unwrap();
    let status = status(temp.path()).unwrap();
    assert_eq!(status.files.len(), 1);
    assert!(status.files[0].unstaged);
    assert!(!status.files[0].staged);
    assert!(diff(temp.path(), "demo.rs", false)
        .unwrap()
        .contains("+fn main() {}"));
    assert!(diff(temp.path(), "../outside", false).is_err());
}
