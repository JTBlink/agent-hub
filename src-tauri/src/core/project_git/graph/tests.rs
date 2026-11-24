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

#[test]
fn lists_branch_tips_outside_loaded_history_and_loads_selected_ancestry() {
    let dir = tempfile::tempdir().unwrap();
    let repo = git2::Repository::init(dir.path()).unwrap();
    let base = repo.find_commit(commit(&repo, "base", &[])).unwrap();
    repo.branch("older", &base, true).unwrap();
    repo.remote("origin", "https://example.invalid/demo.git")
        .unwrap();
    repo.reference("refs/remotes/origin/older", base.id(), true, "test")
        .unwrap();
    let mut tip = base.id();
    for _ in 0..110 {
        let parent = repo.find_commit(tip).unwrap();
        tip = commit(&repo, "newer", &[&parent]);
    }
    repo.branch("main", &repo.find_commit(tip).unwrap(), true)
        .unwrap();
    repo.set_head("refs/heads/main").unwrap();
    let page = graph(dir.path(), true, 100).unwrap();
    assert!(page.has_more);
    assert!(!page
        .commits
        .iter()
        .any(|c| c.commit.sha == base.id().to_string()));
    assert!(page.branches.iter().any(|b| b.name == "older"));
    assert!(page.branches.iter().any(|b| b.name == "origin/older"));
    let local = graph(dir.path(), false, 100).unwrap();
    assert!(local.branches.iter().all(|b| !b.remote));
    let selected = graph_for_branch(dir.path(), true, 100, Some("refs/heads/older")).unwrap();
    assert_eq!(selected.commits.len(), 1);
    assert_eq!(selected.commits[0].commit.sha, base.id().to_string());
    assert_eq!(selected.branches.len(), page.branches.len());
}

#[test]
fn path_graph_skips_unrelated_commits_and_reconnects_literal_path_history() {
    let dir = tempfile::tempdir().unwrap();
    let repo = git2::Repository::init(dir.path()).unwrap();
    let mut index = repo.index().unwrap();
    let mut write = |path: &str, contents: &str| {
        let path = Path::new(path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(dir.path().join(parent)).unwrap();
        }
        std::fs::write(dir.path().join(path), contents).unwrap();
        index.add_path(path).unwrap();
        index.write().unwrap();
    };
    write("src/[file].txt", "initial");
    let first = repo.find_commit(commit(&repo, "add file", &[])).unwrap();
    write("src/f.txt", "unrelated file");
    let other = repo
        .find_commit(commit(&repo, "edit other file", &[&first]))
        .unwrap();
    write("src/[file].txt", "updated");
    let last = repo
        .find_commit(commit(&repo, "edit file", &[&other]))
        .unwrap();
    repo.branch("main", &last, true).unwrap();
    repo.set_head("refs/heads/main").unwrap();

    let selected = graph_for_path(
        dir.path(),
        false,
        100,
        Some("refs/heads/main"),
        Some("src/[file].txt"),
    )
    .unwrap();
    assert_eq!(selected.commits.len(), 2);
    assert_eq!(selected.commits[0].commit.sha, last.id().to_string());
    assert_eq!(selected.commits[0].parents, [first.id().to_string()]);
    assert_eq!(selected.commits[1].commit.sha, first.id().to_string());
    assert!(!selected.has_more);
    assert_eq!(
        graph_for_path(dir.path(), false, 100, None, Some("src"))
            .unwrap()
            .commits
            .len(),
        3
    );
    assert!(
        graph_for_path(dir.path(), false, 100, None, Some("untracked.txt"))
            .unwrap()
            .commits
            .is_empty()
    );
    assert!(graph_for_path(dir.path(), false, 100, None, Some("../outside")).is_err());
}
