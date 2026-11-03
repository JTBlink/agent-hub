use super::*;
use std::fs;

fn write(root: &Path, path: &str, content: &str) {
    let path = root.join(path);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, content).unwrap();
}

fn commit(repo: &git2::Repository) -> git2::Oid {
    let mut index = repo.index().unwrap();
    index
        .add_all(["*"], git2::IndexAddOption::DEFAULT, None)
        .unwrap();
    index.update_all(["*"], None).unwrap();
    index.write().unwrap();
    let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
    let signature = git2::Signature::now("Test Device", "user@example.invalid").unwrap();
    let parent = repo.head().ok().map(|head| head.peel_to_commit().unwrap());
    let parents: Vec<_> = parent.iter().collect();
    repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        "test backup",
        &tree,
        &parents,
    )
    .unwrap()
}

fn baseline(repo: &git2::Repository) {
    let commit = repo.head().unwrap().peel_to_commit().unwrap();
    repo.branch("baseline", &commit, false).unwrap();
    let branch = repo.head().unwrap().shorthand().unwrap().to_string();
    repo.find_branch(&branch, git2::BranchType::Local)
        .unwrap()
        .set_upstream(Some("baseline"))
        .unwrap();
}

#[test]
fn status_lists_staged_unstaged_deleted_and_nested_untracked_files() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let repo = git2::Repository::init(root).unwrap();
    for path in [
        "skills/demo/SKILL.md",
        "skills/old/SKILL.md",
        ".agent-hub/state.json",
    ] {
        write(root, path, "original");
    }
    write(root, ".gitignore", "ignored/\n");
    commit(&repo);
    baseline(&repo);
    write(root, "skills/demo/SKILL.md", "updated content");
    write(root, ".agent-hub/state.json", "updated metadata");
    fs::remove_file(root.join("skills/old/SKILL.md")).unwrap();
    write(root, "skills/新 技能/notes/说明.md", "new file");
    write(root, "skills/staged/SKILL.md", "staged file");
    write(root, "ignored/secret.txt", "ignored file");
    let mut index = repo.index().unwrap();
    index.add_path(Path::new("skills/staged/SKILL.md")).unwrap();
    index.write().unwrap();

    let status = get_status(root).unwrap();
    assert!(status.has_changes);
    assert_eq!(status.changed_skill_count, 4);
    let entries: Vec<_> = status
        .changes
        .iter()
        .map(|change| (change.path.as_str(), &change.kind))
        .collect();
    assert_eq!(
        entries,
        vec![
            (".agent-hub/state.json", &BackupChangeKind::Modified),
            ("skills/demo/SKILL.md", &BackupChangeKind::Modified),
            ("skills/old/SKILL.md", &BackupChangeKind::Deleted),
            ("skills/staged/SKILL.md", &BackupChangeKind::Added),
            ("skills/新 技能/notes/说明.md", &BackupChangeKind::Added),
        ]
    );
    assert_eq!(
        fs::read_to_string(root.join("skills/demo/SKILL.md")).unwrap(),
        "updated content"
    );
}

#[test]
fn status_includes_unpushed_commits_and_clears_after_upstream_catches_up() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let repo = git2::Repository::init(root).unwrap();
    write(root, "skills/demo/SKILL.md", "original");
    commit(&repo);
    baseline(&repo);
    write(root, "skills/demo/SKILL.md", "committed changes");
    let head = commit(&repo);

    let status = get_status(root).unwrap();
    assert!(!status.has_changes);
    assert_eq!(status.ahead, 1);
    assert_eq!(status.changed_skill_count, 1);
    assert_eq!(status.changes[0].path, "skills/demo/SKILL.md");
    repo.find_reference("refs/heads/baseline")
        .unwrap()
        .set_target(head, "uploaded")
        .unwrap();
    assert!(get_status(root).unwrap().changes.is_empty());
}

#[test]
fn remote_only_and_divergent_updates_are_not_listed_as_local_changes() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let repo = git2::Repository::init(root).unwrap();
    write(root, "skills/demo/SKILL.md", "original");
    commit(&repo);
    baseline(&repo);
    let branch = repo.head().unwrap().name().unwrap().to_string();
    repo.set_head("refs/heads/baseline").unwrap();
    write(root, "skills/remote/SKILL.md", "remote change");
    commit(&repo);
    repo.set_head(&branch).unwrap();
    repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
        .unwrap();
    assert!(get_status(root).unwrap().changes.is_empty());
    write(root, "skills/local/SKILL.md", "local change");
    commit(&repo);
    let status = get_status(root).unwrap();
    assert_eq!((status.ahead, status.behind), (1, 1));
    assert_eq!(status.changes.len(), 1);
    assert_eq!(status.changes[0].path, "skills/local/SKILL.md");
}

#[test]
fn first_upload_lists_existing_files_and_staged_rename_preserves_both_paths() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let repo = git2::Repository::init(root).unwrap();
    write(root, "skills/old/SKILL.md", "original");
    commit(&repo);
    // A configured remote with no upstream has never received this backup.
    repo.remote("origin", "https://example.invalid/backup.git")
        .unwrap();
    let status = get_status(root).unwrap();
    assert_eq!(status.upstream_health, "no_upstream");
    assert_eq!(status.changes[0].kind, BackupChangeKind::Added);
    baseline(&repo);
    fs::create_dir_all(root.join("skills/new")).unwrap();
    fs::rename(
        root.join("skills/old/SKILL.md"),
        root.join("skills/new/SKILL.md"),
    )
    .unwrap();
    let mut index = repo.index().unwrap();
    index.remove_path(Path::new("skills/old/SKILL.md")).unwrap();
    index.add_path(Path::new("skills/new/SKILL.md")).unwrap();
    index.write().unwrap();
    let status = get_status(root).unwrap();
    assert_eq!(
        status.changes,
        vec![GitBackupChange {
            path: "skills/new/SKILL.md".into(),
            previous_path: Some("skills/old/SKILL.md".into()),
            kind: BackupChangeKind::Renamed,
        }]
    );
    assert_eq!(status.changed_skill_count, 2);
}

#[test]
fn skill_count_excludes_metadata_and_root_files_and_supports_legacy_layout() {
    let changes = [
        "README.md",
        "user-config/hosts/profiles/example/hosts",
        "user-config/hosts/systems/example/current.hosts",
        ".gitignore",
        ".agent-hub/skills/demo.json",
        "skills/demo/SKILL.md",
        "skills/demo/notes.md",
        "legacy/SKILL.md",
    ]
    .into_iter()
    .map(|path| GitBackupChange {
        path: path.into(),
        previous_path: None,
        kind: BackupChangeKind::Modified,
    })
    .collect::<Vec<_>>();
    assert_eq!(count_changed_skills(&changes), 2);
}
