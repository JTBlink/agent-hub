#![cfg(feature = "herdr")]
#![cfg(unix)]
use app_lib::core::{herdr::control::HerdrControl, project_worktrees, skill_store::SkillStore};
use serde_json::json;
use std::{fs, os::unix::fs::PermissionsExt, path::Path};

fn snapshot(root: &Path, linked: Option<&Path>) -> serde_json::Value {
    let mut spaces = vec![
        json!({"workspace_id":"w1","label":"main","active_tab_id":"w1:t1",
        "worktree":{"checkout_path":root,"is_linked_worktree":false,"repo_key":"repo"}}),
    ];
    let mut panes = vec![
        json!({"workspace_id":"w1","pane_id":"w1:p1","tab_id":"w1:t1",
        "terminal_id":"term-main","cwd":root,"focused":true}),
    ];
    if let Some(linked) = linked {
        spaces.push(
            json!({"workspace_id":"w2","label":"topic","active_tab_id":"w2:t1",
            "worktree":{"checkout_path":linked,"is_linked_worktree":true,"repo_key":"repo"}}),
        );
        panes.push(
            json!({"workspace_id":"w2","pane_id":"w2:p1","tab_id":"w2:t1",
            "terminal_id":"term-topic","cwd":linked,"focused":true}),
        );
    }
    json!({"result":{"snapshot":{"version":"0.9.5","workspaces":spaces,"panes":panes}}})
}

#[test]
fn opens_and_reuses_checkout_under_verified_parent_without_creating_plain_workspace() {
    let temp = tempfile::tempdir().unwrap();
    let main = temp.path().join("main");
    let repo = git2::Repository::init(&main).unwrap();
    let tree = repo
        .find_tree(repo.index().unwrap().write_tree().unwrap())
        .unwrap();
    let sig = git2::Signature::now("Test", "user@example.invalid").unwrap();
    repo.commit(Some("HEAD"), &sig, &sig, "Initial", &tree, &[])
        .unwrap();
    let main = main.canonicalize().unwrap();
    let cli = temp.path().join("herdr");
    fs::write(&cli, r#"#!/bin/sh
printf '%s\n' "$*" >> "$0.calls"
case "$1 $2 $3 $4" in
  'session list --json ') echo '{"sessions":[{"name":"default","running":true}]}' ;;
  '--session default api snapshot') cat "$0.snapshot" ;;
  '--session default worktree open') cp "$0.after" "$0.snapshot"; echo '{"result":{"workspace":{"workspace_id":"w2"}}}' ;;
  *) echo '{"result":{}}' ;;
esac
"#).unwrap();
    fs::set_permissions(&cli, fs::Permissions::from_mode(0o755)).unwrap();
    fs::write(
        cli.with_extension("snapshot"),
        snapshot(&main, None).to_string(),
    )
    .unwrap();
    let store = SkillStore::new(&temp.path().join("app.db")).unwrap();
    let control = HerdrControl::new(cli.clone());
    let project = control.open(&store, "default", "w1", None).unwrap();
    let linked = project_worktrees::create(
        &store,
        &project.project_id,
        main.to_str().unwrap(),
        "topic",
        temp.path().join("topic").to_str().unwrap(),
    )
    .unwrap();
    fs::write(
        cli.with_extension("after"),
        snapshot(&main, Some(Path::new(&linked.path))).to_string(),
    )
    .unwrap();

    // A stale parent or checkout outside the registered repository never mutates Herdr.
    assert!(control
        .open_worktree(&store, "default", &project.project_id, "gone", &linked.path)
        .is_err());
    let foreign = temp.path().join("foreign");
    fs::create_dir(&foreign).unwrap();
    assert!(control
        .open_worktree(
            &store,
            "default",
            &project.project_id,
            "w1",
            foreign.to_str().unwrap()
        )
        .is_err());
    assert!(!fs::read_to_string(cli.with_extension("calls"))
        .unwrap()
        .contains("worktree open"));

    for _ in 0..2 {
        let opened = control
            .open_worktree(&store, "default", &project.project_id, "w1", &linked.path)
            .unwrap();
        assert_eq!(opened.target.workspace_id, "w2");
        assert_eq!(opened.project_id, project.project_id);
        assert_eq!(opened.path, linked.path);
    }
    assert!(control
        .open_worktree(&store, "default", &project.project_id, "w2", &linked.path)
        .is_err());
    let opened = control
        .open_worktree(
            &store,
            "default",
            &project.project_id,
            "w1",
            main.to_str().unwrap(),
        )
        .unwrap();
    assert_eq!(opened.target.workspace_id, "w1");
    let calls = fs::read_to_string(cli.with_extension("calls")).unwrap();
    assert_eq!(
        calls
            .lines()
            .filter(|line| line.contains(&format!(
                "worktree open --workspace w1 --path {} --no-focus",
                linked.path
            )))
            .count(),
        2
    );
    assert!(!calls.contains("workspace create"));
    assert_eq!(store.get_all_projects().unwrap().len(), 1);
}
