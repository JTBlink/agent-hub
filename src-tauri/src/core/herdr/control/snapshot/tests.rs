use super::*;
use serde_json::json;

#[test]
fn non_repository_active_pane_keeps_the_workspace_checkout_and_branch() {
    let root = tempfile::tempdir().unwrap();
    let checkout = root.path().join("demo");
    let repo = git2::Repository::init(&checkout).unwrap();
    let tree = repo
        .find_tree(repo.index().unwrap().write_tree().unwrap())
        .unwrap();
    let signature = git2::Signature::now("Test", "user@example.invalid").unwrap();
    repo.commit(
        Some("refs/heads/main"),
        &signature,
        &signature,
        "Initial",
        &tree,
        &[],
    )
    .unwrap();
    repo.set_head("refs/heads/main").unwrap();
    let mut snapshot: Snapshot = serde_json::from_value(json!({
        "version": "test",
        "workspaces": [{"workspace_id": "w1", "label": "demo", "active_tab_id": "t1"}],
        "panes": [
            {"workspace_id": "w1", "tab_id": "t1", "pane_id": "p1", "terminal_id": "1", "cwd": root.path(), "focused": true},
            {"workspace_id": "w1", "tab_id": "t1", "pane_id": "p2", "terminal_id": "2", "cwd": checkout}
        ]
    })).unwrap();

    enrich_workspaces(&mut snapshot);

    assert_eq!(
        snapshot.workspaces[0].directory.as_deref(),
        checkout.canonicalize().unwrap().to_str()
    );
    assert_eq!(snapshot.workspaces[0].branch.as_deref(), Some("main"));
    // Opening and reattaching must resolve the same checkout as the row.
    let expected = checkout.canonicalize().unwrap();
    assert_eq!(
        directory_for(&snapshot.workspaces[0], &snapshot.panes).unwrap(),
        expected
    );
    assert_eq!(
        directory_for_pane(&snapshot.workspaces[0], &snapshot.panes, &snapshot.panes[0]).unwrap(),
        expected
    );
    let head = repo.head().unwrap().target().unwrap();
    repo.set_head_detached(head).unwrap();
    enrich_workspaces(&mut snapshot);
    assert!(snapshot.workspaces[0].branch.is_none());
    let display = serde_json::to_value(&snapshot.workspaces[0]).unwrap();
    assert_eq!(display["detached"], true);
    assert_eq!(display["head"], head.to_string());
}

#[test]
fn non_repository_pane_does_not_guess_between_multiple_repositories() {
    let root = tempfile::tempdir().unwrap();
    let first = root.path().join("first");
    let second = root.path().join("second");
    git2::Repository::init(&first).unwrap();
    git2::Repository::init(&second).unwrap();
    let mut snapshot: Snapshot = serde_json::from_value(json!({
        "version": "test",
        "workspaces": [{"workspace_id": "w1", "label": "custom", "active_tab_id": "t1"}],
        "panes": [
            {"workspace_id": "w1", "tab_id": "t1", "pane_id": "p1", "terminal_id": "1", "cwd": root.path(), "focused": true},
            {"workspace_id": "w1", "tab_id": "t1", "pane_id": "p2", "terminal_id": "2", "cwd": first},
            {"workspace_id": "w1", "tab_id": "t2", "pane_id": "p3", "terminal_id": "3", "cwd": second}
        ]
    })).unwrap();
    enrich_workspaces(&mut snapshot);
    assert!(snapshot.workspaces[0].directory.is_none());
    assert!(snapshot.workspaces[0].branch.is_none());
    assert!(
        directory_for_pane(&snapshot.workspaces[0], &snapshot.panes, &snapshot.panes[0]).is_err()
    );

    // An explicitly selected repository still resolves even in a mixed workspace.
    snapshot.panes[0].focused = false;
    snapshot.panes[1].focused = true;
    enrich_workspaces(&mut snapshot);
    assert_eq!(
        snapshot.workspaces[0].directory.as_deref(),
        first.canonicalize().unwrap().to_str()
    );
}

#[test]
fn ordinary_non_git_workspace_keeps_its_selected_directory() {
    let root = tempfile::tempdir().unwrap();
    let mut snapshot: Snapshot = serde_json::from_value(json!({
        "version": "test",
        "workspaces": [{"workspace_id": "w1", "label": "notes", "active_tab_id": "t1"}],
        "panes": [{"workspace_id": "w1", "tab_id": "t1", "pane_id": "p1", "terminal_id": "1", "cwd": root.path(), "focused": true}]
    })).unwrap();
    enrich_workspaces(&mut snapshot);
    assert_eq!(
        snapshot.workspaces[0].directory.as_deref(),
        root.path().canonicalize().unwrap().to_str()
    );
    assert!(snapshot.workspaces[0].branch.is_none());
}

#[test]
fn mixed_workspace_displays_the_focused_panes_checkout_and_branch() {
    let root = tempfile::tempdir().unwrap();
    let checkout = root.path().join("checkout");
    let repo = git2::Repository::init(&checkout).unwrap();
    let tree = repo
        .find_tree(repo.index().unwrap().write_tree().unwrap())
        .unwrap();
    let signature = git2::Signature::now("Test", "user@example.invalid").unwrap();
    repo.commit(
        Some("refs/heads/main"),
        &signature,
        &signature,
        "Initial",
        &tree,
        &[],
    )
    .unwrap();
    repo.set_head("refs/heads/main").unwrap();
    repo.remote("origin", "https://github.com/example/demo.git")
        .unwrap();
    let nested = checkout.join("src");
    std::fs::create_dir(&nested).unwrap();
    let mut snapshot: Snapshot = serde_json::from_value(json!({
        "version": "test",
        "workspaces": [{"workspace_id": "w1", "label": "demo", "active_tab_id": "t2"}],
        "panes": [
            {"workspace_id": "w1", "tab_id": "t1", "pane_id": "p1", "terminal_id": "1", "cwd": root.path(), "focused": true},
            {"workspace_id": "w1", "tab_id": "t2", "pane_id": "p2", "terminal_id": "2", "cwd": root.path()},
            {"workspace_id": "w1", "tab_id": "t2", "pane_id": "p3", "terminal_id": "3", "cwd": nested, "focused": true}
        ]
    })).unwrap();
    enrich_workspaces(&mut snapshot);
    let workspace = &snapshot.workspaces[0];
    assert_eq!(
        workspace.directory.as_deref(),
        nested.canonicalize().unwrap().to_str()
    );
    assert_eq!(workspace.branch.as_deref(), Some("main"));
    assert_eq!(workspace.repository_icon.as_deref(), Some("github"));

    // Explicit worktree ownership still wins over the foreground pane's cwd.
    snapshot.workspaces[0].worktree = Some(json!({"checkout_path": checkout}));
    snapshot.panes[2].cwd = Some(root.path().to_string_lossy().into_owned());
    enrich_workspaces(&mut snapshot);
    assert_eq!(
        snapshot.workspaces[0].directory.as_deref(),
        checkout.canonicalize().unwrap().to_str()
    );
    assert_eq!(snapshot.workspaces[0].branch.as_deref(), Some("main"));
}

#[test]
fn ambiguous_workspace_without_an_active_pane_keeps_its_directory_unknown() {
    let root = tempfile::tempdir().unwrap();
    let other = root.path().join("other");
    std::fs::create_dir(&other).unwrap();
    let mut snapshot: Snapshot = serde_json::from_value(json!({
        "version": "test",
        "workspaces": [{"workspace_id": "w1", "label": "demo", "active_tab_id": "missing"}],
        "panes": [
            {"workspace_id": "w1", "tab_id": "t1", "pane_id": "p1", "terminal_id": "1", "cwd": root.path()},
            {"workspace_id": "w1", "tab_id": "t1", "pane_id": "p2", "terminal_id": "2", "cwd": other}
        ]
    })).unwrap();
    enrich_workspaces(&mut snapshot);
    assert!(snapshot.workspaces[0].directory.is_none());
    assert!(snapshot.workspaces[0].branch.is_none());
}
