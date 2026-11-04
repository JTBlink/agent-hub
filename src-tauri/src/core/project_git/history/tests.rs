use super::*;
#[test]
fn previews_include_context_far_from_changes() {
    let dir = tempfile::tempdir().unwrap();
    let repo = git2::Repository::init(dir.path()).unwrap();
    repo.config()
        .unwrap()
        .set_bool("core.autocrlf", false)
        .unwrap();
    let original = (0..30).map(|i| format!("line {i}\n")).collect::<String>();
    std::fs::write(dir.path().join("demo.txt"), &original).unwrap();
    save(&repo, "initial");
    let changed = original
        .replace("line 15\n", "updated\n")
        .replace("line 20\n", "updated second\n");
    std::fs::write(dir.path().join("demo.txt"), changed).unwrap();
    let patch = super::super::diff(dir.path(), "demo.txt", false).unwrap();
    assert!(patch.contains(" line 0\n"));
    assert!(patch.contains(" line 29\n"));
    assert!(patch.contains("+updated second\n"));
    assert_eq!(
        patch.lines().filter(|line| line.starts_with("@@")).count(),
        1
    );
    let commit = save(&repo, "change");
    let patch = commit_diff(dir.path(), &commit, "demo.txt").unwrap();
    assert!(patch.contains(" line 0\n"));
    assert!(patch.contains(" line 29\n"));
    assert!(patch.contains("+updated second\n"));
    assert_eq!(
        patch.lines().filter(|line| line.starts_with("@@")).count(),
        1
    );
}

fn save(repo: &git2::Repository, message: &str) -> String {
    let mut index = repo.index().unwrap();
    index.add_path(Path::new("demo.txt")).unwrap();
    index.write().unwrap();
    let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
    let signature = git2::Signature::now("Example", "user@example.invalid").unwrap();
    let parent = repo.head().ok().map(|head| head.peel_to_commit().unwrap());
    repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        message,
        &tree,
        &parent.iter().collect::<Vec<_>>(),
    )
    .unwrap()
    .to_string()
}
#[test]
fn reads_initial_and_parent_diffs_without_using_the_working_tree() {
    let temp = tempfile::tempdir().unwrap();
    let repo = git2::Repository::init(temp.path()).unwrap();
    std::fs::write(temp.path().join("demo.txt"), "first\n").unwrap();
    let first = save(&repo, "Initial\n\nFull description");
    let initial = commit_details(temp.path(), &first).unwrap();
    assert_eq!(initial.message, "Initial\n\nFull description");
    assert!(initial.parents.is_empty());
    assert_eq!(initial.additions, 1);
    assert_eq!(initial.files[0].status, "added");
    assert_eq!(initial.author_email, "user@example.invalid");
    assert_eq!(initial.committer_email, "user@example.invalid");
    assert_eq!(initial.files[0].additions, Some(1));
    assert_eq!(initial.files[0].deletions, Some(0));
    assert!(commit_diff(temp.path(), &first, "demo.txt")
        .unwrap()
        .contains("+first"));
    std::fs::write(temp.path().join("demo.txt"), "second\n").unwrap();
    let second = save(&repo, "Update");
    std::fs::write(temp.path().join("demo.txt"), "uncommitted\n").unwrap();
    let details = commit_details(temp.path(), &second).unwrap();
    assert_eq!(details.parents, vec![first]);
    assert_eq!((details.additions, details.deletions), (1, 1));
    assert_eq!(details.files[0].additions, Some(1));
    assert_eq!(details.files[0].deletions, Some(1));
    let patch = commit_diff(temp.path(), &second, "demo.txt").unwrap();
    assert!(patch.contains("-first") && patch.contains("+second"));
    assert!(!patch.contains("uncommitted"));
    assert!(commit_details(temp.path(), "HEAD").is_err());
    assert!(commit_diff(temp.path(), &second, "../outside").is_err());
}
#[test]
fn binary_files_have_no_text_line_counts() {
    let temp = tempfile::tempdir().unwrap();
    let repo = git2::Repository::init(temp.path()).unwrap();
    std::fs::write(temp.path().join("demo.txt"), b"binary\0content").unwrap();
    let sha = save(&repo, "Binary file");
    let details = commit_details(temp.path(), &sha).unwrap();
    assert_eq!(details.files.len(), 1);
    assert_eq!(details.files[0].additions, None);
    assert_eq!(details.files[0].deletions, None);
}

#[test]
fn preserves_rename_metadata_and_patch_paths() {
    let temp = tempfile::tempdir().unwrap();
    let repo = git2::Repository::init(temp.path()).unwrap();
    std::fs::write(temp.path().join("demo.txt"), "unchanged content\n").unwrap();
    let first = save(&repo, "Initial");
    std::fs::rename(
        temp.path().join("demo.txt"),
        temp.path().join("renamed.txt"),
    )
    .unwrap();
    let mut index = repo.index().unwrap();
    index.remove_path(Path::new("demo.txt")).unwrap();
    index.add_path(Path::new("renamed.txt")).unwrap();
    index.write().unwrap();
    let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
    let signature = git2::Signature::now("Example", "user@example.invalid").unwrap();
    let parent = repo
        .find_commit(git2::Oid::from_str(&first).unwrap())
        .unwrap();
    let sha = repo
        .commit(
            Some("HEAD"),
            &signature,
            &signature,
            "Rename",
            &tree,
            &[&parent],
        )
        .unwrap()
        .to_string();
    let details = commit_details(temp.path(), &sha).unwrap();
    assert_eq!(details.files.len(), 1);
    assert_eq!(details.files[0].status, "renamed");
    assert_eq!(details.files[0].old_path.as_deref(), Some("demo.txt"));
    let patch = commit_diff(temp.path(), &sha, "renamed.txt").unwrap();
    assert!(patch.contains("rename from demo.txt"));
    assert!(patch.contains("rename to renamed.txt"));
}
#[test]
fn pages_tag_ancestry_without_reading_newer_head_commits() {
    let temp = tempfile::tempdir().unwrap();
    let repo = git2::Repository::init(temp.path()).unwrap();
    let mut ids = Vec::new();
    for index in 0..13 {
        std::fs::write(temp.path().join("demo.txt"), format!("content {index}\n")).unwrap();
        ids.push(save(&repo, &format!("Change {index}")));
    }
    let first = commit_history(temp.path(), &ids[11], 0).unwrap();
    assert_eq!(first.commits.len(), 10);
    assert_eq!(first.commits[0].sha, ids[11]);
    assert!(first.has_more);
    let second = commit_history(temp.path(), &ids[11], 10).unwrap();
    assert_eq!(second.commits.len(), 2);
    assert!(!second.has_more);
    assert_eq!(second.commits[1].sha, ids[0]);
    let all: Vec<_> = first
        .commits
        .iter()
        .chain(second.commits.iter())
        .map(|commit| &commit.sha)
        .collect();
    assert!(!all.contains(&&ids[12]));
    assert_eq!(
        all.iter().collect::<std::collections::HashSet<_>>().len(),
        12
    );
    assert!(commit_history(temp.path(), "HEAD", 0).is_err());
    assert!(commit_history(temp.path(), &ids[11], 100_001).is_err());
}
#[test]
fn initial_and_paged_history_share_topological_order_with_skewed_merge_dates() {
    let temp = tempfile::tempdir().unwrap();
    let repo = git2::Repository::init(temp.path()).unwrap();
    let tree = repo
        .find_tree(repo.index().unwrap().write_tree().unwrap())
        .unwrap();
    let save = |message: &str, time: i64, parents: &[&git2::Commit<'_>]| {
        let signature =
            git2::Signature::new("Example", "user@example.invalid", &git2::Time::new(time, 0))
                .unwrap();
        repo.commit(None, &signature, &signature, message, &tree, parents)
            .unwrap()
    };
    let root = repo.find_commit(save("Root", 500, &[])).unwrap();
    let left = repo.find_commit(save("Left", 100, &[&root])).unwrap();
    let right = repo.find_commit(save("Right", 200, &[&root])).unwrap();
    let merge = save("Merge", 300, &[&left, &right]);
    repo.reference("refs/heads/main", merge, true, "fixture")
        .unwrap();
    repo.set_head("refs/heads/main").unwrap();
    let initial = super::super::status(temp.path()).unwrap();
    let page = commit_history(temp.path(), &merge.to_string(), 0).unwrap();
    assert_eq!(
        initial
            .commits
            .iter()
            .map(|commit| &commit.sha)
            .collect::<Vec<_>>(),
        page.commits
            .iter()
            .map(|commit| &commit.sha)
            .collect::<Vec<_>>()
    );
    assert_eq!(page.commits.last().unwrap().sha, root.id().to_string());
}

#[test]
fn commit_file_views_read_history_and_compare_current_worktree() {
    let dir = tempfile::tempdir().unwrap();
    let repo = git2::Repository::init(dir.path()).unwrap();
    std::fs::write(dir.path().join("demo.txt"), "original\n").unwrap();
    let sha = save(&repo, "initial");
    std::fs::write(dir.path().join("demo.txt"), "working\n").unwrap();
    assert_eq!(
        commit_file_view(dir.path(), &sha, "demo.txt", Some("revision")).unwrap(),
        "original\n"
    );
    let diff = commit_file_view(dir.path(), &sha, "demo.txt", Some("working")).unwrap();
    assert!(diff.contains("-original"));
    assert!(diff.contains("+working"));
    assert!(commit_file_view(dir.path(), &sha, "../outside", Some("revision")).is_err());
    assert!(commit_file_view(dir.path(), &sha, "demo.txt", Some("unknown")).is_err());
    assert_eq!(
        std::fs::read_to_string(dir.path().join("demo.txt")).unwrap(),
        "working\n"
    );
}
