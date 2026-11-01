use super::*;
fn commit(repo: &git2::Repository, message: &str, parents: &[&git2::Commit<'_>]) -> git2::Oid {
    let tree = repo
        .find_tree(repo.index().unwrap().write_tree().unwrap())
        .unwrap();
    let sig = git2::Signature::now("Example", "user@example.invalid").unwrap();
    repo.commit(None, &sig, &sig, message, &tree, parents)
        .unwrap()
}
#[test]
fn includes_merge_edges_tags_and_optional_remote_history() {
    let dir = tempfile::tempdir().unwrap();
    let repo = git2::Repository::init(dir.path()).unwrap();
    let base = repo.find_commit(commit(&repo, "base", &[])).unwrap();
    let left = repo.find_commit(commit(&repo, "left", &[&base])).unwrap();
    let right = repo.find_commit(commit(&repo, "right", &[&base])).unwrap();
    let merge = repo
        .find_commit(commit(&repo, "merge", &[&left, &right]))
        .unwrap();
    repo.branch("main", &merge, true).unwrap();
    repo.set_head("refs/heads/main").unwrap();
    repo.remote("origin", "https://example.invalid/demo.git")
        .unwrap();
    repo.reference("refs/remotes/origin/main", merge.id(), true, "test")
        .unwrap();
    repo.reference_symbolic(
        "refs/remotes/origin/HEAD",
        "refs/remotes/origin/main",
        true,
        "test",
    )
    .unwrap();
    repo.tag_lightweight("v1.0.0", merge.as_object(), false)
        .unwrap();
    let remote = commit(&repo, "remote", &[&merge]);
    repo.reference("refs/remotes/origin/topic", remote, true, "test")
        .unwrap();
    let local = graph(dir.path(), false, 100).unwrap();
    assert_eq!(local.commits[0].parents.len(), 2);
    assert!(local.commits[0].refs.iter().any(|r| r.name == "v1.0.0"));
    assert!(!local
        .commits
        .iter()
        .any(|c| c.commit.sha == remote.to_string()));
    let all = graph(dir.path(), true, 100).unwrap();
    assert_eq!(all.commits[0].commit.sha, remote.to_string());
    assert!(all.commits[0].refs[0].remote);
    let head = all.commits.iter().find(|commit| commit.head).unwrap();
    assert_eq!(head.commit.sha, merge.id().to_string());
    assert!(head.refs.iter().any(|reference| reference.name == "main"
        && reference.current
        && reference.kind == "branch"));
    assert!(head
        .refs
        .iter()
        .any(|reference| reference.name == "origin/main"
            && reference.remote_name.as_deref() == Some("origin")));
    assert!(head.refs.iter().any(|reference| reference.name == "v1.0.0"
        && reference.kind == "tag"
        && !reference.current));
}
#[test]
fn empty_repository_has_no_commits() {
    let dir = tempfile::tempdir().unwrap();
    git2::Repository::init(dir.path()).unwrap();
    assert!(graph(dir.path(), true, 100).unwrap().commits.is_empty());
}
