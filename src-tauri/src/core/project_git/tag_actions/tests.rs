use super::*;

fn commit(repo: &git2::Repository, content: &str) -> git2::Oid {
    let root = repo.workdir().unwrap();
    std::fs::write(root.join("demo.txt"), content).unwrap();
    let mut index = repo.index().unwrap();
    index.add_path(Path::new("demo.txt")).unwrap();
    index.write().unwrap();
    let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
    let signature = git2::Signature::now("Example", "user@example.invalid").unwrap();
    let parent = repo.head().ok().and_then(|head| head.peel_to_commit().ok());
    repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        content,
        &tree,
        &parent.iter().collect::<Vec<_>>(),
    )
    .unwrap()
}
fn init(root: &Path) -> git2::Repository {
    let repo = git2::Repository::init(root).unwrap();
    repo.set_head("refs/heads/main").unwrap();
    repo.config()
        .unwrap()
        .set_str("core.hooksPath", "disabled-hooks")
        .unwrap();
    repo
}
fn tag(repo: &git2::Repository, name: &str, oid: git2::Oid, annotated: bool) {
    let object = repo.find_object(oid, None).unwrap();
    if annotated {
        let signature = git2::Signature::now("Example", "user@example.invalid").unwrap();
        repo.tag(name, &object, &signature, "Release", false)
            .unwrap();
    } else {
        repo.tag_lightweight(name, &object, false).unwrap();
    }
}

#[test]
fn checks_out_both_tag_types_and_creates_at_tag_instead_of_head_or_same_named_branch() {
    for annotated in [false, true] {
        let temp = tempfile::tempdir().unwrap();
        let repo = init(temp.path());
        let base = commit(&repo, "base");
        tag(&repo, "release/v1", base, annotated);
        let newer = commit(&repo, "newer");
        repo.branch("release/v1", &repo.find_commit(newer).unwrap(), false)
            .unwrap();
        let sha = base.to_string();
        // A conflicting edit must survive a failed checkout.
        std::fs::write(temp.path().join("demo.txt"), "local edit").unwrap();
        assert!(tag_action(
            temp.path(),
            GitTagAction::Checkout,
            "release/v1",
            Some(&sha),
            None,
            None
        )
        .is_err());
        assert_eq!(repo.head().unwrap().target(), Some(newer));
        assert_eq!(
            std::fs::read_to_string(temp.path().join("demo.txt")).unwrap(),
            "local edit"
        );
        std::fs::write(temp.path().join("demo.txt"), "newer").unwrap();
        tag_action(
            temp.path(),
            GitTagAction::Checkout,
            "release/v1",
            Some(&sha),
            None,
            None,
        )
        .unwrap();
        assert!(repo.head_detached().unwrap());
        assert_eq!(repo.head().unwrap().target(), Some(base));
        super::super::repository_action(
            temp.path(),
            super::super::GitRepositoryAction::SwitchBranch,
            Some("main"),
        )
        .unwrap();
        tag_action(
            temp.path(),
            GitTagAction::CreateBranch,
            "release/v1",
            Some(&sha),
            Some("from-tag"),
            None,
        )
        .unwrap();
        assert_eq!(repo.head().unwrap().shorthand(), Some("from-tag"));
        assert_eq!(repo.head().unwrap().target(), Some(base));
        assert!(tag_action(
            temp.path(),
            GitTagAction::CreateBranch,
            "release/v1",
            Some(&sha),
            Some("from-tag"),
            None
        )
        .is_err());
    }
}

#[test]
fn pushes_only_selected_tag_without_force_and_deletes_only_local_reference() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("source");
    let repo = init(&source);
    let first = commit(&repo, "base");
    tag(&repo, "v1", first, true);
    tag(&repo, "unselected", first, false);
    let first_remote = git2::Repository::init_bare(temp.path().join("first.git")).unwrap();
    let second_remote = git2::Repository::init_bare(temp.path().join("second.git")).unwrap();
    for (name, remote) in [("first", &first_remote), ("second", &second_remote)] {
        repo.remote(name, remote.path().to_str().unwrap()).unwrap();
    }
    let sha = first.to_string();
    tag_action(
        &source,
        GitTagAction::Push,
        "v1",
        Some(&sha),
        None,
        Some("second"),
    )
    .unwrap();
    let original = second_remote
        .find_reference("refs/tags/v1")
        .unwrap()
        .target();
    assert_eq!(
        original,
        repo.find_reference("refs/tags/v1").unwrap().target()
    );
    assert!(second_remote
        .find_reference("refs/tags/unselected")
        .is_err());
    assert!(first_remote.find_reference("refs/tags/v1").is_err());
    assert_eq!(repo.head().unwrap().target(), Some(first));
    let next = commit(&repo, "next");
    repo.tag_delete("v1").unwrap();
    tag(&repo, "v1", next, false);
    assert!(tag_action(
        &source,
        GitTagAction::Push,
        "v1",
        Some(&next.to_string()),
        None,
        Some("second")
    )
    .is_err());
    assert_eq!(
        second_remote
            .find_reference("refs/tags/v1")
            .unwrap()
            .target(),
        original
    );
    tag_action(
        &source,
        GitTagAction::Delete,
        "v1",
        Some(&next.to_string()),
        None,
        None,
    )
    .unwrap();
    assert!(repo.find_reference("refs/tags/v1").is_err());
    assert_eq!(
        second_remote
            .find_reference("refs/tags/v1")
            .unwrap()
            .target(),
        original
    );
    assert!(repo.find_reference("refs/tags/unselected").is_ok());
}

#[test]
fn rejects_stale_tags_invalid_names_unconfigured_remotes_and_unfinished_operations() {
    let temp = tempfile::tempdir().unwrap();
    let repo = init(temp.path());
    let first = commit(&repo, "base");
    tag(&repo, "v1", first, false);
    let next = commit(&repo, "next");
    repo.tag_delete("v1").unwrap();
    tag(&repo, "v1", next, false);
    for action in [
        GitTagAction::Checkout,
        GitTagAction::Push,
        GitTagAction::Delete,
        GitTagAction::CreateBranch,
    ] {
        assert!(tag_action(
            temp.path(),
            action,
            "v1",
            Some(&first.to_string()),
            Some("topic"),
            Some("missing")
        )
        .is_err());
    }
    for invalid in ["--all", "", "v1..bad", "../v1"] {
        assert!(tag_action(temp.path(), GitTagAction::Delete, invalid, None, None, None).is_err());
    }
    for invalid in ["--detach", "", "bad..branch"] {
        assert!(tag_action(
            temp.path(),
            GitTagAction::CreateBranch,
            "v1",
            None,
            Some(invalid),
            None
        )
        .is_err());
    }
    assert!(tag_action(
        temp.path(),
        GitTagAction::Push,
        "v1",
        None,
        None,
        Some(temp.path().to_str().unwrap())
    )
    .is_err());
    assert!(tag_action(
        temp.path(),
        GitTagAction::Delete,
        "missing",
        None,
        None,
        None
    )
    .is_err());
    std::fs::write(repo.path().join("MERGE_HEAD"), next.to_string()).unwrap();
    assert!(tag_action(temp.path(), GitTagAction::Checkout, "v1", None, None, None).is_err());
    assert_eq!(repo.head().unwrap().target(), Some(next));
    assert!(repo.find_reference("refs/tags/v1").is_ok());
    assert!(repo.find_reference("refs/heads/topic").is_err());
}
