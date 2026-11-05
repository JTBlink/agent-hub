use super::*;
use tempfile::tempdir;

#[test]
fn resolves_only_worktrees_of_the_registered_repository() {
    let temp = tempdir().unwrap();
    let root = temp.path().join("main");
    let checkout = temp.path().join("topic checkout");
    let repo = git2::Repository::init(&root).unwrap();
    let signature = git2::Signature::now("Example", "user@example.invalid").unwrap();
    let tree_id = repo.index().unwrap().write_tree().unwrap();
    repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        "Initial",
        &repo.find_tree(tree_id).unwrap(),
        &[],
    )
    .unwrap();
    repo.worktree("topic", &checkout, None).unwrap();
    let store = SkillStore::new(&temp.path().join("store.db")).unwrap();
    store
        .insert_project(&super::super::skill_store::ProjectRecord {
            id: "demo".into(),
            name: "Demo".into(),
            path: root.to_string_lossy().into_owned(),
            workspace_type: "project".into(),
            linked_agent_key: None,
            linked_agent_name: None,
            disabled_path: None,
            sort_order: 0,
            created_at: 0,
            updated_at: 0,
            visited_at: None,
        })
        .unwrap();
    assert_eq!(list(&store, "demo").unwrap().len(), 2);
    assert_eq!(
        directory(&store, "demo", Some(checkout.to_str().unwrap())).unwrap(),
        checkout.canonicalize().unwrap()
    );
    assert!(directory(&store, "demo", Some(temp.path().to_str().unwrap())).is_err());
    assert!(directory(&store, "missing", None).is_err());
    assert_eq!(list_directory(&checkout).unwrap().len(), 2);
    std::fs::create_dir(root.join("subdirectory")).unwrap();
    assert_eq!(list_directory(&root.join("subdirectory")).unwrap().len(), 1);
    drop(repo);
    let moved = temp.path().join("moved-main");
    std::fs::rename(&root, &moved).unwrap();
    let missing = list(&store, "demo").unwrap();
    assert_eq!(missing.len(), 1);
    assert_eq!(Path::new(&missing[0].path), root);
    assert!(!missing[0].available);
    assert!(missing[0].is_main);
    assert!(directory(&store, "demo", None).is_err());
    assert!(store.get_project_by_id("demo").unwrap().is_some());
    std::fs::rename(&moved, &root).unwrap();
    assert!(list(&store, "demo")
        .unwrap()
        .iter()
        .all(|tree| tree.available));
}

#[test]
fn creates_from_selected_head_and_preserves_existing_data() {
    let temp = tempdir().unwrap();
    let root = temp.path().join("main");
    let repo = git2::Repository::init(&root).unwrap();
    let signature = git2::Signature::now("Example", "user@example.invalid").unwrap();
    std::fs::write(root.join("readme.txt"), "committed").unwrap();
    let mut index = repo.index().unwrap();
    index.add_path(Path::new("readme.txt")).unwrap();
    index.write().unwrap();
    let tree_id = index.write_tree().unwrap();
    let head = repo
        .commit(
            Some("HEAD"),
            &signature,
            &signature,
            "Initial",
            &repo.find_tree(tree_id).unwrap(),
            &[],
        )
        .unwrap();
    let store = SkillStore::new(&temp.path().join("store.db")).unwrap();
    store
        .insert_project(&super::super::skill_store::ProjectRecord {
            id: "demo".into(),
            name: "Demo".into(),
            path: root.to_string_lossy().into_owned(),
            workspace_type: "project".into(),
            linked_agent_key: None,
            linked_agent_name: None,
            disabled_path: None,
            sort_order: 0,
            created_at: 0,
            updated_at: 0,
            visited_at: None,
        })
        .unwrap();
    std::fs::write(root.join("readme.txt"), "keep local changes").unwrap();
    let target = temp.path().join("topic checkout");
    let tree = create(
        &store,
        "demo",
        root.to_str().unwrap(),
        "feature/topic",
        target.to_str().unwrap(),
    )
    .unwrap();
    assert_eq!(tree.branch.as_deref(), Some("feature/topic"));
    assert_eq!(tree.head, Some(head.to_string()));
    assert_eq!(
        std::fs::read_to_string(target.join("readme.txt")).unwrap(),
        "committed"
    );
    assert_eq!(
        std::fs::read_to_string(root.join("readme.txt")).unwrap(),
        "keep local changes"
    );
    assert_eq!(list(&store, "demo").unwrap().len(), 2);
    assert!(directory(&store, "demo", Some(&tree.path)).is_ok());
    // A detached linked checkout is also an authorized source.
    let linked = git2::Repository::open(&target).unwrap();
    let second_tree = linked.treebuilder(None).unwrap().write().unwrap();
    let second_head = linked
        .commit(
            Some("HEAD"),
            &signature,
            &signature,
            "Topic",
            &linked.find_tree(second_tree).unwrap(),
            &[&linked.find_commit(head).unwrap()],
        )
        .unwrap();
    linked.set_head_detached(second_head).unwrap();
    let second = temp.path().join("second");
    let created = create(
        &store,
        "demo",
        &tree.path,
        "second",
        second.to_str().unwrap(),
    )
    .unwrap();
    assert_eq!(created.head, Some(second_head.to_string()));
    let unused = temp.path().join("unused");
    for branch in ["feature/topic", "bad..branch", "-option", ""] {
        assert!(create(
            &store,
            "demo",
            root.to_str().unwrap(),
            branch,
            unused.to_str().unwrap()
        )
        .is_err());
        assert!(!unused.exists());
    }
    for destination in [
        target.clone(),
        root.join(".git/unsafe"),
        temp.path().join("missing/child"),
    ] {
        assert!(create(
            &store,
            "demo",
            root.to_str().unwrap(),
            "unused",
            destination.to_str().unwrap()
        )
        .is_err());
    }
    assert!(repo.find_branch("unused", git2::BranchType::Local).is_err());
    assert!(create(
        &store,
        "demo",
        temp.path().to_str().unwrap(),
        "outside",
        unused.to_str().unwrap()
    )
    .is_err());
    assert!(!unused.exists());
}

#[test]
fn non_git_directories_still_have_a_workspace() {
    let temp = tempdir().unwrap();
    let worktrees = list_directory(temp.path()).unwrap();
    assert_eq!(worktrees.len(), 1);
    assert!(worktrees[0].is_main && worktrees[0].available);
    assert_eq!(worktrees[0].branch, None);
}

#[test]
fn parses_detached_locked_and_missing_worktrees_with_literal_paths() {
    let records = parse_worktrees("worktree /workspace/main\0HEAD abc\0branch refs/heads/main\0\0worktree /workspace/topic\nbranch\0HEAD def\0detached\0locked reason\0prunable missing\0\0");
    assert_eq!(records.len(), 2);
    assert!(records[0].is_main);
    assert_eq!(records[0].branch.as_deref(), Some("main"));
    assert_eq!(records[1].path, "/workspace/topic\nbranch");
    assert_eq!(records[1].branch, None);
    assert!(records[1].locked);
    assert!(!records[1].available);
}

#[test]
fn reads_directories_lazily_and_bounds_text_previews() {
    let temp = tempdir().unwrap();
    let root = temp.path();
    std::fs::create_dir(root.join("src")).unwrap();
    std::fs::create_dir(root.join(".git")).unwrap();
    std::fs::write(root.join("readme.md"), "hello").unwrap();
    std::fs::write(root.join("src/large.txt"), vec![b'a'; 1024 * 1024 + 1]).unwrap();
    std::fs::write(root.join("src/binary"), [0, 1]).unwrap();
    let files = entries(root, "").unwrap();
    assert_eq!(files.len(), 2);
    assert_eq!(files[0].path, "src");
    assert!(files[0].is_dir);
    assert_eq!(read_file(root, "readme.md").unwrap(), "hello");
    assert!(read_file(root, "src/large.txt").is_err());
    assert!(read_file(root, "src/binary").is_err());
    assert!(entries(root, "../").is_err());
    assert!(read_file(root, "/etc/passwd").is_err());
}

#[cfg(unix)]
#[test]
fn refuses_links_outside_the_selected_worktree() {
    let root = tempdir().unwrap();
    let other = tempdir().unwrap();
    std::fs::write(other.path().join("private"), "data").unwrap();
    std::os::unix::fs::symlink(other.path(), root.path().join("link")).unwrap();
    assert!(entries(root.path(), "link").is_err());
    assert!(read_file(root.path(), "link/private").is_err());
}

#[test]
fn file_entries_mark_ignored_paths_but_preserve_tracked_and_negated_entries() {
    let temp = tempdir().unwrap();
    let root = temp.path();
    let repo = git2::Repository::init(root).unwrap();
    std::fs::create_dir(root.join("cache")).unwrap();
    std::fs::create_dir(root.join("src")).unwrap();
    std::fs::write(root.join("cache/output.txt"), "generated").unwrap();
    std::fs::write(root.join("src/tracked.txt"), "tracked").unwrap();
    std::fs::write(root.join("src/local.txt"), "local").unwrap();
    std::fs::write(root.join("keep.txt"), "kept").unwrap();
    let mut index = repo.index().unwrap();
    index.add_path(Path::new("src/tracked.txt")).unwrap();
    index.write().unwrap();
    std::fs::write(root.join(".gitignore"), "cache/\n*.txt\n!keep.txt\n").unwrap();
    std::fs::write(root.join(".git/info/exclude"), "private\n").unwrap();
    std::fs::write(root.join("private"), "local").unwrap();
    let listing = entries(root, "").unwrap();
    let ignored = |name: &str| {
        listing
            .iter()
            .find(|entry| entry.name == name)
            .unwrap()
            .is_ignored
    };
    assert!(ignored("cache"));
    assert!(ignored("private"));
    assert!(!ignored("src"));
    assert!(!ignored("keep.txt"));
    assert!(entries(root, "cache").unwrap()[0].is_ignored);
    let nested = entries(root, "src").unwrap();
    assert!(
        !nested
            .iter()
            .find(|entry| entry.name == "tracked.txt")
            .unwrap()
            .is_ignored
    );
    assert!(
        nested
            .iter()
            .find(|entry| entry.name == "local.txt")
            .unwrap()
            .is_ignored
    );
}

#[test]
fn plain_directory_entries_are_not_git_ignored() {
    let temp = tempdir().unwrap();
    std::fs::write(temp.path().join(".gitignore"), "output\n").unwrap();
    std::fs::write(temp.path().join("output"), "data").unwrap();
    assert!(entries(temp.path(), "")
        .unwrap()
        .iter()
        .all(|entry| !entry.is_ignored));
}
