use super::*;
fn fixture() -> (tempfile::TempDir, PathBuf, PathBuf, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("app");
    let legacy = home.join("skills");
    let shared = temp.path().join("agents/skills");
    fs::create_dir_all(legacy.join("demo")).unwrap();
    fs::create_dir_all(shared.parent().unwrap()).unwrap();
    fs::write(legacy.join("demo/SKILL.md"), "# Demo").unwrap();
    fs::write(home.join("agent-hub.db"), "database fixture").unwrap();
    (temp, home, legacy, shared)
}

#[test]
fn merges_without_overwrite_keeps_state_and_old_contents() {
    let (_temp, home, legacy, shared) = fixture();
    fs::create_dir_all(shared.join("external")).unwrap();
    fs::write(shared.join("external/SKILL.md"), "# External").unwrap();
    assert_eq!(active_root(&home, &legacy, &shared), legacy);
    migrate(&home, &legacy, &shared).unwrap();
    assert_eq!(active_root(&home, &legacy, &shared), shared);
    assert_eq!(pending_repoint(&home).unwrap(), Some(legacy.clone()));
    assert!(shared.join("demo/SKILL.md").is_file());
    assert!(shared.join("external/SKILL.md").is_file());
    assert!(legacy.join("demo/SKILL.md").is_file());
    assert!(!shared.join("agent-hub.db").exists());
    finish_repoint(&home).unwrap();
    migrate(&home, &legacy, &shared).unwrap();
    assert!(pending_repoint(&home).unwrap().is_none());
}

#[test]
fn conflict_keeps_old_root_and_all_existing_bytes() {
    let (_temp, home, legacy, shared) = fixture();
    fs::create_dir_all(shared.join("demo")).unwrap();
    fs::write(shared.join("demo/SKILL.md"), "# Different").unwrap();
    assert!(migrate(&home, &legacy, &shared).is_err());
    assert_eq!(active_root(&home, &legacy, &shared), legacy);
    assert_eq!(
        fs::read_to_string(shared.join("demo/SKILL.md")).unwrap(),
        "# Different"
    );
    assert!(!home.join(JOURNAL).exists());
}

#[test]
fn preserves_git_history_remote_and_can_commit_after_migration() {
    let (_temp, home, legacy, shared) = fixture();
    commit_fixture(&legacy, "initial fixture");
    let repo = git2::Repository::open(&legacy).unwrap();
    repo.remote("origin", "https://example.invalid/skills.git")
        .unwrap();
    let before = repo.head().unwrap().target();
    drop(repo);
    migrate(&home, &legacy, &shared).unwrap();
    let repo = git2::Repository::open(&shared).unwrap();
    assert_eq!(repo.head().unwrap().target(), before);
    assert_eq!(
        repo.find_remote("origin").unwrap().url(),
        Some("https://example.invalid/skills.git")
    );
    fs::write(shared.join("demo/SKILL.md"), "# Updated").unwrap();
    commit_fixture(&shared, "update fixture");
    assert_ne!(repo.head().unwrap().target(), before);
    assert_eq!(
        git2::Repository::open(&legacy)
            .unwrap()
            .head()
            .unwrap()
            .target(),
        before
    );
}

#[test]
fn retries_interrupted_copy_but_refuses_independent_git_history() {
    let (_temp, home, legacy, shared) = fixture();
    fs::create_dir_all(legacy.join(".git")).unwrap();
    fs::write(legacy.join(".git/HEAD"), "ref: refs/heads/main\n").unwrap();
    fs::create_dir_all(shared.join(".git")).unwrap();
    fs::write(shared.join(".git/HEAD"), "ref: refs/heads/main\n").unwrap();
    assert!(migrate(&home, &legacy, &shared).is_err());
    fs::write(
        home.join(JOURNAL),
        serde_json::to_vec(&(&legacy, &shared)).unwrap(),
    )
    .unwrap();
    migrate(&home, &legacy, &shared).unwrap();
    assert!(activated(&home));
    assert!(!home.join(JOURNAL).exists());
    assert!(shared.join("demo/SKILL.md").exists());
}

#[cfg(unix)]
#[test]
fn replaces_only_links_to_old_library_and_preserves_external_links() {
    let (temp, home, legacy, shared) = fixture();
    fs::create_dir_all(&shared).unwrap();
    std::os::unix::fs::symlink(legacy.join("demo"), shared.join("demo")).unwrap();
    let external = temp.path().join("external");
    fs::create_dir_all(&external).unwrap();
    fs::write(external.join("SKILL.md"), "# External").unwrap();
    std::os::unix::fs::symlink(&external, shared.join("external")).unwrap();
    migrate(&home, &legacy, &shared).unwrap();
    assert!(!shared.join("demo").is_symlink());
    assert!(shared.join("demo/SKILL.md").is_file());
    assert!(shared.join("external").is_symlink());
    assert!(legacy.join("demo/SKILL.md").is_file());
}

#[test]
fn same_legacy_and_shared_activates_without_copying() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("app");
    let same = home.join("skills");
    fs::create_dir_all(same.join("demo")).unwrap();
    fs::write(same.join("demo/SKILL.md"), "# Demo").unwrap();
    migrate(&home, &same, &same).unwrap();
    assert!(activated(&home));
    assert!(same.join("demo/SKILL.md").is_file());
}

fn commit_fixture(path: &std::path::Path, message: &str) {
    let repository = git2::Repository::init(path).unwrap();
    let mut index = repository.index().unwrap();
    index
        .add_all(["*"], git2::IndexAddOption::DEFAULT, None)
        .unwrap();
    let tree_id = index.write_tree().unwrap();
    let tree = repository.find_tree(tree_id).unwrap();
    let signature = git2::Signature::now("Fixture", "user@example.invalid").unwrap();
    let parent = repository
        .head()
        .ok()
        .and_then(|head| head.peel_to_commit().ok());
    let parents: Vec<_> = parent.iter().collect();
    repository
        .commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &parents,
        )
        .unwrap();
}
