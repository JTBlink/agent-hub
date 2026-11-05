use super::*;

#[test]
fn reads_fetch_addresses_from_a_linked_worktree_without_changing_configuration() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("main");
    let repo = git2::Repository::init(&root).unwrap();
    assert!(remotes(&root).unwrap().is_empty());
    let signature = git2::Signature::now("Example", "user@example.invalid").unwrap();
    let tree_id = repo.index().unwrap().write_tree().unwrap();
    let tree = repo.find_tree(tree_id).unwrap();
    repo.commit(Some("HEAD"), &signature, &signature, "Initial", &tree, &[])
        .unwrap();
    let ssh = "git@example.invalid:team/demo.git";
    let https = "https://example.invalid/team/demo.git";
    let authenticated = "https://example:secret@example.invalid/team/demo.git";
    repo.remote("upstream", ssh).unwrap();
    repo.remote("origin", authenticated).unwrap();
    repo.remote_set_pushurl("origin", Some("ssh://git@example.invalid/push.git"))
        .unwrap();
    let checkout = temp.path().join("topic");
    repo.worktree("topic", &checkout, None).unwrap();
    let data = remotes(&checkout).unwrap();
    assert_eq!(data.len(), 2);
    assert_eq!((&*data[0].name, &*data[0].url), ("origin", https));
    assert_eq!((&*data[1].name, &*data[1].url), ("upstream", ssh));
    assert_eq!(
        repo.find_remote("origin").unwrap().url(),
        Some(authenticated)
    );
    assert!(remotes(temp.path()).is_err());
}
