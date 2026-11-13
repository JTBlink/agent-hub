#![cfg(feature = "herdr")]
#![cfg(unix)]
use app_lib::core::herdr::control::HerdrControl;
use serde_json::json;
use std::{fs, os::unix::fs::PermissionsExt};

#[test]
fn manual_refresh_queries_each_native_repository_once_without_focusing_or_creating() {
    let root = tempfile::tempdir().unwrap();
    let checkout = root.path().join("checkout");
    git2::Repository::init(&checkout).unwrap();
    let cli = root.path().join("herdr");
    fs::write(
        &cli,
        r#"#!/bin/sh
printf '%s\n' "$*" >> "$0.calls"
case "$1 $2 $3 $4" in
  'session list --json ') echo '{"sessions":[{"name":"default","running":true}]}' ;;
  '--session default api snapshot') cat "$0.snapshot" ;;
  '--session default worktree list') echo '{"result":{"worktrees":[]}}' ;;
  *) echo 'unexpected command' >&2; exit 1 ;;
esac
"#,
    )
    .unwrap();
    fs::set_permissions(&cli, fs::Permissions::from_mode(0o755)).unwrap();
    let workspaces: Vec<_> = ["w1", "w2"]
        .iter()
        .map(|id| {
            json!({
                "workspace_id":id, "label":id, "active_tab_id":"tab",
                "worktree":{"checkout_path":checkout,"repo_key":"repo"}
            })
        })
        .collect();
    fs::write(
        cli.with_extension("snapshot"),
        json!({"result":{"snapshot":{"version":"test","workspaces":workspaces}}}).to_string(),
    )
    .unwrap();
    let control = HerdrControl::new(cli.clone());
    control.snapshot("default").unwrap();
    let calls = fs::read_to_string(cli.with_extension("calls")).unwrap();
    assert!(!calls.contains("worktree list"));
    fs::write(cli.with_extension("calls"), "").unwrap();

    control.refresh_worktrees("default").unwrap();
    let calls = fs::read_to_string(cli.with_extension("calls")).unwrap();
    assert_eq!(calls.matches("worktree list").count(), 1);
    assert!(calls.contains("--session default worktree list --workspace w1"));
    assert!(!calls.contains("focus"));
    assert!(!calls.contains("create"));
}
