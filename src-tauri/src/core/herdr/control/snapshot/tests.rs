use super::*;
use serde_json::json;

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
