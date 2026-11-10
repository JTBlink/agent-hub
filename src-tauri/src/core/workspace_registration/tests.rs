use super::*;
#[test]
fn registers_real_task_directory_once_without_initializing_skill_folders() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("task package");
    std::fs::create_dir_all(root.join(".local/runs")).unwrap();
    std::fs::create_dir_all(root.join("config")).unwrap();
    std::fs::write(root.join("config/task.json"), "{}").unwrap();
    let root = root.canonicalize().unwrap();
    let store = SkillStore::new(&temp.path().join("store.db")).unwrap();
    let id = resolve_project(&store, &root).unwrap();
    assert_eq!(resolve_project(&store, &root).unwrap(), id);
    assert_eq!(store.get_all_projects().unwrap().len(), 1);
    assert!(!root.join(".claude").exists());
    assert!(!root.join(".agents").exists());
    let directory =
        crate::core::project_worktrees::directory(&store, &id, Some(root.to_str().unwrap()))
            .unwrap();
    let files = crate::core::project_worktrees::entries(&directory, "").unwrap();
    assert!(files.iter().any(|file| file.path == ".local"));
    let config = crate::core::project_worktrees::entries(&directory, "config").unwrap();
    assert!(config.iter().any(|file| file.path == "config/task.json"));
}

#[test]
fn reuses_project_for_a_known_git_worktree() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("main");
    let checkout = temp.path().join("topic");
    let repo = git2::Repository::init(&root).unwrap();
    let signature = git2::Signature::now("Example", "user@example.invalid").unwrap();
    let tree = repo.index().unwrap().write_tree().unwrap();
    repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        "Initial",
        &repo.find_tree(tree).unwrap(),
        &[],
    )
    .unwrap();
    repo.worktree("topic", &checkout, None).unwrap();
    let store = SkillStore::new(&temp.path().join("store.db")).unwrap();
    let id = resolve_project(&store, &root.canonicalize().unwrap()).unwrap();
    assert_eq!(
        resolve_project(&store, &checkout.canonicalize().unwrap()).unwrap(),
        id
    );
    assert_eq!(store.get_all_projects().unwrap().len(), 1);
}

#[test]
fn sixteenth_workspace_evicts_old_history_and_alias_reopening_keeps_one_registration() {
    let temp = tempfile::tempdir().unwrap();
    let store = SkillStore::new(&temp.path().join("store.db")).unwrap();
    let mut ids = Vec::new();
    for index in 0..16 {
        let directory = temp.path().join(format!("project-{index}"));
        std::fs::create_dir(&directory).unwrap();
        let id = resolve_project(&store, &directory).unwrap();
        store.touch_project_visited(&id).unwrap();
        ids.push(id);
    }
    assert_eq!(
        store
            .get_all_projects()
            .unwrap()
            .iter()
            .filter(|p| p.visited_at != Some(0))
            .count(),
        15
    );
    assert_eq!(
        store
            .get_project_by_id(&ids[0])
            .unwrap()
            .unwrap()
            .visited_at,
        Some(0)
    );
    let root = temp.path().join("project-15");
    assert_eq!(resolve_project(&store, &root.join(".")).unwrap(), ids[15]);
    #[cfg(unix)]
    {
        let alias = temp.path().join("alias");
        std::os::unix::fs::symlink(&root, &alias).unwrap();
        assert_eq!(resolve_project(&store, &alias).unwrap(), ids[15]);
    }
    assert_eq!(store.get_all_projects().unwrap().len(), 16);
    store.touch_project_visited(&ids[0]).unwrap();
    assert!(
        store
            .get_project_by_id(&ids[0])
            .unwrap()
            .unwrap()
            .visited_at
            .unwrap()
            > 0
    );
    assert_eq!(
        store
            .get_project_by_id(&ids[1])
            .unwrap()
            .unwrap()
            .visited_at,
        Some(0)
    );
}
