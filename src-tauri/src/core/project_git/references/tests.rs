use super::*;
#[test]
fn lists_local_remote_annotated_tags_and_stashes_without_changing_head() {
    let temp = tempfile::tempdir().unwrap();
    let mut repo = git2::Repository::init(temp.path()).unwrap();
    let signature = git2::Signature::now("Example", "user@example.invalid").unwrap();
    let tree_id = repo.index().unwrap().write_tree().unwrap();
    let tree = repo.find_tree(tree_id).unwrap();
    let head = repo
        .commit(Some("HEAD"), &signature, &signature, "Initial", &tree, &[])
        .unwrap();
    drop(tree);
    let commit = repo.find_commit(head).unwrap();
    repo.branch("topic", &commit, false).unwrap();
    repo.tag("v1", commit.as_object(), &signature, "Release", false)
        .unwrap();
    for name in ["v0.1.9", "v0.1.10", "v0.1.12"] {
        repo.tag(
            name,
            commit.as_object(),
            &signature,
            &format!("Release {name}"),
            false,
        )
        .unwrap();
    }
    repo.tag_lightweight("v0.1.11", commit.as_object(), false)
        .unwrap();
    drop(commit);
    repo.remote("origin", "https://example.invalid/demo.git")
        .unwrap();
    repo.reference("refs/remotes/origin/main", head, false, "fixture")
        .unwrap();
    std::fs::write(temp.path().join("demo.txt"), "untracked").unwrap();
    repo.stash_save(
        &signature,
        "Example stash",
        Some(git2::StashFlags::INCLUDE_UNTRACKED),
    )
    .unwrap();
    let data = references(temp.path()).unwrap();
    assert!(data
        .entries
        .iter()
        .any(|entry| entry.kind == "branches" && entry.name == "topic"));
    assert!(data.entries.iter().any(|entry| entry.kind == "tags"
        && entry.name == "v1"
        && entry.sha == Some(head.to_string())));
    assert!(data
        .entries
        .iter()
        .any(|entry| entry.kind == "remotes" && entry.name == "origin/main"));
    assert!(data.entries.iter().any(|entry| entry.kind == "stashes"));
    let tags: Vec<_> = data
        .entries
        .iter()
        .filter(|entry| entry.kind == "tags")
        .collect();
    assert_eq!(
        tags.iter()
            .map(|entry| entry.name.as_str())
            .collect::<Vec<_>>(),
        vec!["v0.1.12", "v0.1.11", "v0.1.10", "v0.1.9", "v1"]
    );
    assert_eq!(tags[0].summary.as_deref(), Some("Release v0.1.12"));
    assert_eq!(tags[1].summary.as_deref(), Some("Initial"));
    assert_eq!(repo.head().unwrap().target(), Some(head));
    assert!(repo.stash_foreach(|_, _, _| true).is_ok());
}
