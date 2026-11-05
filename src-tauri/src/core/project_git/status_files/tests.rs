use super::*;

#[test]
fn preserves_index_and_working_statuses_and_unusual_file_names() {
    let (files, truncated) = parse_status(
        "MM both.txt\0 D deleted.txt\0A  staged.txt\0?? folder/空 格\nname.txt\0UU conflict.txt\0",
    )
    .unwrap();
    assert!(!truncated);
    assert!(files[0].staged && files[0].unstaged);
    assert_eq!(files[1].status, "deleted");
    assert!(!files[1].staged && files[1].unstaged);
    assert!(files[2].staged && !files[2].unstaged);
    assert_eq!(files[3].path, "folder/空 格\nname.txt");
    assert_eq!(files[3].status, "added");
    assert!(files[4].conflicted);
    assert!(!files[4].staged && !files[4].unstaged);
    assert!(parse_status("invalid\0").is_err());
}

#[test]
fn bounds_the_change_list_and_only_reports_truncation_for_additional_files() {
    let mut output = "?? file.txt\0".repeat(1000);
    assert!(!parse_status(&output).unwrap().1);
    output.push_str("?? extra.txt\0");
    let (files, truncated) = parse_status(&output).unwrap();
    assert_eq!(files.len(), 1000);
    assert!(truncated);
}

#[test]
fn reads_nested_untracked_files_without_rewriting_the_index_or_detecting_renames() {
    let temp = tempfile::tempdir().unwrap();
    let repo = git2::Repository::init(temp.path()).unwrap();
    std::fs::write(temp.path().join("old.txt"), "original").unwrap();
    super::super::actions::set_staged(temp.path(), &["old.txt".into()], true).unwrap();
    let signature = git2::Signature::now("Example", "user@example.invalid").unwrap();
    let tree_id = repo.index().unwrap().write_tree().unwrap();
    let tree = repo.find_tree(tree_id).unwrap();
    repo.commit(Some("HEAD"), &signature, &signature, "Initial", &tree, &[])
        .unwrap();
    std::fs::rename(temp.path().join("old.txt"), temp.path().join("new.txt")).unwrap();
    std::fs::create_dir(temp.path().join("nested")).unwrap();
    std::fs::write(temp.path().join("nested/file.txt"), "new").unwrap();
    let index = repo.path().join("index");
    let before = std::fs::read(&index).unwrap();
    let (files, truncated) = status_files(temp.path()).unwrap();
    assert!(!truncated);
    assert_eq!(files.len(), 3);
    assert!(files
        .iter()
        .any(|file| file.path == "nested/file.txt" && file.unstaged));
    assert!(files
        .iter()
        .any(|file| file.path == "old.txt" && file.status == "deleted"));
    assert!(files
        .iter()
        .any(|file| file.path == "new.txt" && file.status == "added"));
    assert_eq!(std::fs::read(index).unwrap(), before);
}
