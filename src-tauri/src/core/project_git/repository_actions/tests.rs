use super::*;

#[test]
fn initializes_only_the_selected_folder_and_preserves_existing_content() {
    let parent = tempfile::tempdir().unwrap();
    git2::Repository::init(parent.path()).unwrap();
    let folder = parent.path().join("ordinary");
    std::fs::create_dir(&folder).unwrap();
    std::fs::write(folder.join("demo.txt"), "keep me").unwrap();
    repository_action(&folder, GitRepositoryAction::Initialize, None).unwrap();
    let repo = repository(&folder).unwrap();
    assert_eq!(
        repo.workdir().unwrap().canonicalize().unwrap(),
        folder.canonicalize().unwrap()
    );
    assert!(repo.is_empty().unwrap());
    assert_eq!(
        std::fs::read_to_string(folder.join("demo.txt")).unwrap(),
        "keep me"
    );
    repo.config()
        .unwrap()
        .set_str("agenthub.test", "preserved")
        .unwrap();
    assert!(repository_action(&folder, GitRepositoryAction::Initialize, None).is_err());
    assert_eq!(
        repo.config().unwrap().get_string("agenthub.test").unwrap(),
        "preserved"
    );
    let missing = parent.path().join("missing");
    assert!(repository_action(&missing, GitRepositoryAction::Initialize, None).is_err());
    assert!(!missing.exists());
    assert!(super::super::inspect(&folder).unwrap().is_some());
}

fn init(root: &Path) -> git2::Repository {
    let repo = git2::Repository::init(root).unwrap();
    repo.set_head("refs/heads/main").unwrap();
    configure(&repo);
    repo
}
fn configure(repo: &git2::Repository) {
    let mut config = repo.config().unwrap();
    config.set_str("user.name", "Example Developer").unwrap();
    config
        .set_str("user.email", "user@example.invalid")
        .unwrap();
    config.set_bool("commit.gpgsign", false).unwrap();
    config.set_str("core.hooksPath", "disabled-hooks").unwrap();
}
fn commit_file(root: &Path, content: &str) {
    std::fs::write(root.join("demo.txt"), content).unwrap();
    super::super::set_staged(root, &["demo.txt".into()], true).unwrap();
    super::super::commit(root, "Update example").unwrap();
}

#[test]
fn switches_and_creates_local_branches_without_overwriting_edits() {
    let temp = tempfile::tempdir().unwrap();
    let repo = init(temp.path());
    commit_file(temp.path(), "base");
    repository_action(
        temp.path(),
        GitRepositoryAction::CreateBranch,
        Some("topic"),
    )
    .unwrap();
    commit_file(temp.path(), "topic");
    repository_action(temp.path(), GitRepositoryAction::SwitchBranch, Some("main")).unwrap();
    std::fs::write(temp.path().join("demo.txt"), "uncommitted").unwrap();
    assert!(repository_action(
        temp.path(),
        GitRepositoryAction::SwitchBranch,
        Some("topic")
    )
    .is_err());
    assert_eq!(repo.head().unwrap().shorthand(), Some("main"));
    assert_eq!(
        std::fs::read_to_string(temp.path().join("demo.txt")).unwrap(),
        "uncommitted"
    );
    for invalid in ["--detach", "bad..branch", "refs/../main", ""] {
        assert!(repository_action(
            temp.path(),
            GitRepositoryAction::CreateBranch,
            Some(invalid)
        )
        .is_err());
    }
    assert!(repository_action(
        temp.path(),
        GitRepositoryAction::SwitchBranch,
        Some("missing")
    )
    .is_err());
    assert!(repository_action(temp.path(), GitRepositoryAction::Push, None).is_err());
    assert!(repository_action(temp.path(), GitRepositoryAction::Pull, None).is_err());
    assert!(repository_action(temp.path(), GitRepositoryAction::Fetch, None).is_err());
    std::fs::write(
        repo.path().join("MERGE_HEAD"),
        repo.head().unwrap().target().unwrap().to_string(),
    )
    .unwrap();
    assert!(repository_action(
        temp.path(),
        GitRepositoryAction::CreateBranch,
        Some("blocked")
    )
    .is_err());
}

#[test]
fn fetches_pulls_and_pushes_upstream_without_force_or_merging_divergence() {
    let temp = tempfile::tempdir().unwrap();
    let remote_path = temp.path().join("remote.git");
    let remote = git2::Repository::init_bare(&remote_path).unwrap();
    remote.set_head("refs/heads/main").unwrap();
    let source_path = temp.path().join("source");
    let source = init(&source_path);
    commit_file(&source_path, "base");
    source
        .remote("origin", remote_path.to_str().unwrap())
        .unwrap();
    run_git(
        &source_path,
        &["push", "-u", "origin", "HEAD:refs/heads/main"],
    )
    .unwrap();
    let peer_path = temp.path().join("peer");
    let peer = git2::Repository::clone(remote_path.to_str().unwrap(), &peer_path).unwrap();
    configure(&peer);
    commit_file(&source_path, "remote update");
    repository_action(&source_path, GitRepositoryAction::Push, None).unwrap();
    let previous = peer.head().unwrap().target().unwrap();
    repository_action(&peer_path, GitRepositoryAction::Fetch, None).unwrap();
    assert_eq!(peer.head().unwrap().target().unwrap(), previous);
    repository_action(&peer_path, GitRepositoryAction::Pull, None).unwrap();
    assert_eq!(
        std::fs::read_to_string(peer_path.join("demo.txt")).unwrap(),
        "remote update"
    );
    commit_file(&peer_path, "peer update");
    repository_action(&peer_path, GitRepositoryAction::Push, None).unwrap();
    repository_action(&source_path, GitRepositoryAction::Pull, None).unwrap();
    assert_eq!(
        source.head().unwrap().target(),
        peer.head().unwrap().target()
    );
    commit_file(&source_path, "source divergence");
    commit_file(&peer_path, "peer divergence");
    repository_action(&source_path, GitRepositoryAction::Push, None).unwrap();
    let before = peer.head().unwrap().target();
    assert!(repository_action(&peer_path, GitRepositoryAction::Pull, None).is_err());
    assert!(repository_action(&peer_path, GitRepositoryAction::Push, None).is_err());
    assert_eq!(peer.head().unwrap().target(), before);
    assert_eq!(
        std::fs::read_to_string(peer_path.join("demo.txt")).unwrap(),
        "peer divergence"
    );
    peer.set_head_detached(before.unwrap()).unwrap();
    assert!(repository_action(&peer_path, GitRepositoryAction::Push, None).is_err());
}
