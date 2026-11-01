#![cfg(unix)]
use super::*;
use serde_json::json;
use std::os::unix::fs::PermissionsExt;

fn fixture(cwd: &Path, workspaces: Value, panes: Value, fail_focus: bool) -> PathBuf {
    let executable = cwd.join("fake-herdr");
    let script = format!(
        r##"#!/bin/sh
printf '%s\n' "$@" >> "$0.log"
case "$3 $4" in
  'session list') echo '{{"sessions":[{{"name":"agent-hub-agents","running":true}}]}}' ;;
  'workspace list') cat <<'JSON'
{workspaces}
JSON
;;
  'pane list') cat <<'JSON'
{panes}
JSON
;;
  'workspace create') echo '{{"result":{{"workspace":{{"workspace_id":"w-new"}}}}}}' ;;
  'workspace focus')
    if [ '{fail_focus}' = true ]; then echo 'focus unavailable' >&2; exit 1; fi
    echo '{{"result":{{}}}}' ;;
  *) exit 2 ;;
esac
"##,
        workspaces = json!({"result": {"workspaces": workspaces}}),
        panes = json!({"result": {"panes": panes}}),
    );
    std::fs::write(&executable, script).unwrap();
    std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o700)).unwrap();
    executable
}
use std::path::PathBuf;

#[test]
fn reuses_the_selected_worktree_instead_of_the_previously_focused_project() {
    let directory = tempfile::tempdir().unwrap();
    let checkout = directory.path().join("feature checkout");
    std::fs::create_dir(&checkout).unwrap();
    let executable = fixture(
        directory.path(),
        json!([
            {"workspace_id":"w-old", "focused": true, "worktree":{"checkout_path":directory.path()}},
            {"workspace_id":"w-feature", "worktree":{"checkout_path":checkout}}
        ]),
        json!([]),
        false,
    );
    assert_eq!(
        prepare_workspace(&executable, &checkout).unwrap(),
        ["--session", SESSION]
    );
    let log = std::fs::read_to_string(executable.with_extension("log")).unwrap();
    assert!(log.contains("\nfocus\nw-feature\n"));
    assert!(!log.contains("\ncreate\n"));
}

#[test]
fn reuses_a_non_git_workspace_with_a_matching_pane_directory() {
    let directory = tempfile::tempdir().unwrap();
    let executable = fixture(
        directory.path(),
        json!([
            {"workspace_id":"w-folder", "worktree":null}
        ]),
        json!([{"workspace_id":"w-folder", "cwd":directory.path()}]),
        false,
    );
    prepare_workspace(&executable, directory.path()).unwrap();
    let log = std::fs::read_to_string(executable.with_extension("log")).unwrap();
    assert!(log.contains("\nfocus\nw-folder\n"));
    assert!(!log.contains("\ncreate\n"));
}

#[test]
fn creates_and_focuses_a_workspace_in_the_explicit_project_directory() {
    let directory = tempfile::tempdir().unwrap();
    let checkout = directory.path().join("project's checkout");
    std::fs::create_dir(&checkout).unwrap();
    let executable = fixture(directory.path(), json!([]), json!([]), false);
    prepare_workspace(&executable, &checkout).unwrap();
    let log = std::fs::read_to_string(executable.with_extension("log")).unwrap();
    assert!(log.contains(&format!(
        "\n--cwd\n{}\n--label\nproject's checkout\n",
        checkout.canonicalize().unwrap().display()
    )));
    assert!(log.contains("\nfocus\nw-new\n"));
}

#[test]
fn reports_focus_failure_instead_of_attaching_to_an_unrelated_workspace() {
    let directory = tempfile::tempdir().unwrap();
    let executable = fixture(directory.path(), json!([]), json!([]), true);
    assert!(prepare_workspace(&executable, directory.path()).is_err());
}
