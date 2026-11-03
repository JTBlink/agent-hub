#![cfg(unix)]
use app_lib::core::{herdr::control::HerdrControl, skill_store::SkillStore};
use serde_json::json;
use std::{fs, os::unix::fs::PermissionsExt, path::Path};

fn fake_cli(root: &Path, directory: &Path) -> std::path::PathBuf {
    let cli = root.join("herdr");
    fs::write(&cli, r#"#!/bin/sh
printf '%s\n' "$*" >> "$0.calls"
if [ "$1" = session ]; then cat "$0.sessions"
elif [ "$3 $4" = 'api snapshot' ]; then cat "$0.snapshot"
elif [ "$3 $4" = 'pane process-info' ] && [ -f "$0.process" ]; then cat "$0.process"
elif [ "$3 $4" = 'pane process-info' ]; then printf '%s\n' '{"result":{"process_info":{"shell_pid":1,"foreground_process_group_id":2,"foreground_processes":[{"name":"codex"}]}}}'
elif [ "$3 $4" = 'agent prompt' ] && { [ "$#" != 6 ] || [ "${6#-}" != "$6" ]; }; then echo 'unknown option' >&2; exit 2
else printf '%s\n' '{"result":{"type":"ok"}}'; fi
"#).unwrap();
    fs::set_permissions(&cli, fs::Permissions::from_mode(0o755)).unwrap();
    fs::write(
        root.join("herdr.sessions"),
        r#"{"sessions":[{"name":"default","running":true,"default":true}]}"#,
    )
    .unwrap();
    fs::write(root.join("herdr.snapshot"), json!({"result":{"snapshot":{
        "version":"0.9.3", "workspaces":[{"workspace_id":"w1","label":"same-name","active_tab_id":"w1:t1"}],
        "tabs":[{"tab_id":"w1:t1","workspace_id":"w1","label":"development"}],
        "panes":[{"pane_id":"w1:p1","workspace_id":"w1","tab_id":"w1:t1","terminal_id":"terminal-1","cwd":directory,"focused":true,"revision":1}],
        "agents":[]
    }}}).to_string()).unwrap();
    cli
}

#[test]
fn selecting_unregistered_herdr_workspace_opens_and_reuses_its_actual_directory() {
    let root = tempfile::tempdir().unwrap();
    let directory = root.path().join("checkout");
    fs::create_dir(&directory).unwrap();
    let store = SkillStore::new(&root.path().join("app.db")).unwrap();
    let control = HerdrControl::new(fake_cli(root.path(), &directory));
    let opened = control.open(&store, "default", "w1", None).unwrap();
    assert_eq!(
        opened.path,
        directory.canonicalize().unwrap().to_string_lossy()
    );
    assert_eq!(store.get_all_projects().unwrap().len(), 1);
    let again = control.open(&store, "default", "w1", None).unwrap();
    assert_eq!(opened.project_id, again.project_id);
    assert_eq!(again.target.pane_id, "w1:p1");
    assert!(
        !directory.join(".claude").exists(),
        "Opening must not initialize skill directories"
    );
}

#[test]
fn stopped_sessions_and_missing_directories_do_not_register_projects() {
    let root = tempfile::tempdir().unwrap();
    let directory = root.path().join("gone");
    let cli = fake_cli(root.path(), &directory);
    let control = HerdrControl::new(cli);
    let store = SkillStore::new(&root.path().join("app.db")).unwrap();
    assert!(control.open(&store, "default", "w1", None).is_err());
    assert!(control.open(&store, "another-session", "w1", None).is_err());
    assert!(store.get_all_projects().unwrap().is_empty());
}

#[test]
fn identical_labels_in_different_directories_remain_different_projects() {
    let root = tempfile::tempdir().unwrap();
    let first = root.path().join("one");
    let second = root.path().join("two");
    fs::create_dir(&first).unwrap();
    fs::create_dir(&second).unwrap();
    let cli = fake_cli(root.path(), &first);
    let control = HerdrControl::new(cli);
    let store = SkillStore::new(&root.path().join("app.db")).unwrap();
    let opened = control.open(&store, "default", "w1", None).unwrap();
    fake_cli(root.path(), &second);
    let other = control.open(&store, "default", "w1", None).unwrap();
    assert_ne!(opened.project_id, other.project_id);
    assert_eq!(other.path, second.canonicalize().unwrap().to_string_lossy());
}

/// Run explicitly with HERDR_CONTROL_TEST_BINARY=herdr; only a unique test session is created.
#[test]
#[ignore]
fn live_workspace_layout_and_pty_attachment_keep_the_server_running() {
    use app_lib::core::{
        herdr::control::Action,
        terminal::{TerminalManager, TerminalSize, TerminalSpec},
    };
    use std::{
        process::{Command, Stdio},
        sync::mpsc,
        time::{Duration, Instant},
    };
    let binary =
        std::env::var_os("HERDR_CONTROL_TEST_BINARY").expect("Set the test Herdr executable");
    let root = tempfile::tempdir().unwrap();
    let directory = root.path().join("checkout");
    fs::create_dir(&directory).unwrap();
    let session = format!(
        "hub-test-{}",
        &uuid::Uuid::new_v4().simple().to_string()[..12]
    );
    struct Guard {
        binary: std::ffi::OsString,
        session: String,
    }
    impl Drop for Guard {
        fn drop(&mut self) {
            let _ = Command::new(&self.binary)
                .args(["session", "stop", &self.session])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
            let _ = Command::new(&self.binary)
                .args(["session", "delete", &self.session])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
    }
    let guard = Guard {
        binary: binary.clone(),
        session: session.clone(),
    };
    let mut server = Command::new(&binary);
    server
        .args(["--session", &session, "server"])
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    for key in [
        "HERDR_ENV",
        "HERDR_SESSION",
        "HERDR_SOCKET",
        "HERDR_SOCKET_PATH",
        "HERDR_PANE_ID",
        "HERDR_TAB_ID",
        "HERDR_WORKSPACE_ID",
    ] {
        server.env_remove(key);
    }
    let mut child = server.spawn().unwrap();
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    let control = HerdrControl::new(binary.into());
    let deadline = Instant::now() + Duration::from_secs(12);
    while !control
        .sessions()
        .unwrap()
        .iter()
        .any(|s| s.name == session && s.running)
    {
        assert!(Instant::now() < deadline, "Test server did not start");
        std::thread::sleep(Duration::from_millis(100));
    }
    let created = Command::new(&guard.binary)
        .args([
            "--session",
            &session,
            "workspace",
            "create",
            "--cwd",
            directory.to_str().unwrap(),
            "--label",
            "integration-check",
            "--no-focus",
        ])
        .output()
        .unwrap();
    assert!(
        created.status.success(),
        "{}",
        String::from_utf8_lossy(&created.stderr)
    );
    let value: serde_json::Value = serde_json::from_slice(&created.stdout).unwrap();
    let id = value["result"]["workspace"]["workspace_id"]
        .as_str()
        .unwrap();
    let store = SkillStore::new(&root.path().join("app.db")).unwrap();
    let opened = control.open(&store, &session, id, None).unwrap();
    let new_tab = control
        .action(&opened.target, Action::NewTab, None)
        .unwrap()
        .target
        .unwrap();
    let split = control
        .action(&new_tab, Action::SplitRight, None)
        .unwrap()
        .target
        .unwrap();
    control.action(&split, Action::Zoom, None).unwrap();
    control
        .open(&store, &session, id, Some(&split.pane_id))
        .unwrap();
    assert!(control
        .snapshot(&session)
        .unwrap()
        .panes
        .iter()
        .any(|p| p.pane_id == split.pane_id && p.focused));
    assert!(control
        .action(&split, Action::Read, None)
        .unwrap()
        .output
        .is_some());
    let command = control
        .attachment(&store, &opened.project_id, &opened.path, &split)
        .unwrap();
    let manager = TerminalManager::default();
    let (tx, rx) = mpsc::channel();
    let terminal = manager
        .create(
            "main",
            TerminalSpec {
                project_id: opened.project_id.clone(),
                cwd: directory.clone(),
                command,
                integration: None,
                size: TerminalSize {
                    rows: 24,
                    cols: 100,
                },
            },
            move |event| tx.send(event).is_ok(),
        )
        .unwrap();
    assert!(
        rx.recv_timeout(Duration::from_secs(10)).is_ok(),
        "Attachment produced no output"
    );
    std::thread::sleep(Duration::from_millis(500));
    manager
        .write("main", &terminal.id, b"HUB_FOCUS_MARKER".to_vec())
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    while !control
        .action(&split, Action::Read, None)
        .unwrap()
        .output
        .unwrap_or_default()
        .contains("HUB_FOCUS_MARKER")
    {
        assert!(
            Instant::now() < deadline,
            "Input did not reach explicit pane; layout={:?}; output={:?}",
            control.snapshot(&session).unwrap().layouts,
            control.action(&split, Action::Read, None).unwrap().output
        );
        std::thread::sleep(Duration::from_millis(100));
    }
    control.action(&split, Action::Close, None).unwrap();
    assert!(!control
        .snapshot(&session)
        .unwrap()
        .panes
        .iter()
        .any(|pane| pane.pane_id == split.pane_id));
    let recovered_command = control
        .attachment(&store, &opened.project_id, &opened.path, &split)
        .expect("The workspace must remain attachable after its saved pane closes");
    let (recovered_tx, recovered_rx) = mpsc::channel();
    let recovered = manager
        .create(
            "main",
            TerminalSpec {
                project_id: opened.project_id,
                cwd: directory,
                command: recovered_command,
                integration: None,
                size: TerminalSize {
                    rows: 24,
                    cols: 100,
                },
            },
            move |event| recovered_tx.send(event).is_ok(),
        )
        .unwrap();
    assert!(
        recovered_rx.recv_timeout(Duration::from_secs(10)).is_ok(),
        "Recovered attachment produced no output"
    );
    manager.close("main", &recovered.id).unwrap();
    manager.close("main", &terminal.id).unwrap();
    assert!(control
        .sessions()
        .unwrap()
        .iter()
        .any(|s| s.name == session && s.running));
}

#[test]
fn prompts_require_ready_foreground_and_unchanged_agent_identity() {
    use app_lib::core::herdr::control::{Action, Target};
    let root = tempfile::tempdir().unwrap();
    let directory = root.path().join("checkout");
    fs::create_dir(&directory).unwrap();
    let control = HerdrControl::new(fake_cli(root.path(), &directory));
    let file = root.path().join("herdr.snapshot");
    let mut fixture: serde_json::Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
    let mut pane = fixture["result"]["snapshot"]["panes"][0].clone();
    pane["agent_status"] = json!("blocked");
    pane["agent"] = json!("codex");
    pane["agent_session"] = json!({"id":"original"});
    fixture["result"]["snapshot"]["agents"] = json!([pane.clone()]);
    fs::write(&file, fixture.to_string()).unwrap();
    let snapshot = control.snapshot("default").unwrap();
    let target = Target::from_pane("default", &snapshot.agents[0]);
    assert!(control
        .action(&target, Action::Prompt, Some("Review this change"))
        .is_err());
    pane["agent_status"] = json!("idle");
    fixture["result"]["snapshot"]["agents"] = json!([pane.clone()]);
    fs::write(&file, fixture.to_string()).unwrap();
    for process in [
        json!({"name":"vim","argv0":"vim","argv":["vim","codex"]}),
        json!({"name":"tail","argv0":"tail","argv":["tail","codex.log"]}),
    ] {
        fs::write(root.path().join("herdr.process"), json!({"result":{"process_info":{"shell_pid":1,"foreground_process_group_id":2,"foreground_processes":[process]}}}).to_string()).unwrap();
        assert!(control
            .action(
                &target,
                Action::Prompt,
                Some("Must not reach a file argument")
            )
            .is_err());
    }
    fs::remove_file(root.path().join("herdr.process")).unwrap();
    control
        .action(&target, Action::Prompt, Some("Review this change"))
        .unwrap();
    control
        .action(&target, Action::Prompt, Some("--wait"))
        .unwrap();
    pane["agent_session"] = json!({"id":"replacement"});
    fixture["result"]["snapshot"]["agents"] = json!([pane]);
    fs::write(&file, fixture.to_string()).unwrap();
    assert!(control
        .action(&target, Action::Prompt, Some("Never send twice"))
        .is_err());
    let calls = fs::read_to_string(root.path().join("herdr.calls")).unwrap();
    assert_eq!(
        calls
            .lines()
            .filter(|s| s.contains(" agent prompt "))
            .count(),
        2
    );
    assert!(calls.contains("agent prompt w1:p1 Review this change"));
    assert!(calls.contains("agent prompt w1:p1 \n--wait"));
    assert!(!calls.contains("Never send twice"));
    assert!(!calls.contains("agent send-keys"));
}

#[test]
fn a_linked_worktree_reuses_its_registered_project_instead_of_registering_a_duplicate() {
    let root = tempfile::tempdir().unwrap();
    let main = root.path().join("main");
    let linked = root.path().join("topic");
    let repo = git2::Repository::init(&main).unwrap();
    let tree_id = repo.index().unwrap().write_tree().unwrap();
    let tree = repo.find_tree(tree_id).unwrap();
    let signature = git2::Signature::now("Test", "user@example.invalid").unwrap();
    repo.commit(Some("HEAD"), &signature, &signature, "Initial", &tree, &[])
        .unwrap();
    let store = SkillStore::new(&root.path().join("app.db")).unwrap();
    let control = HerdrControl::new(fake_cli(root.path(), &main));
    let project = control.open(&store, "default", "w1", None).unwrap();
    app_lib::core::project_worktrees::create(
        &store,
        &project.project_id,
        main.to_str().unwrap(),
        "feature-terminal",
        linked.to_str().unwrap(),
    )
    .unwrap();
    fake_cli(root.path(), &linked);
    let opened = control.open(&store, "default", "w1", None).unwrap();
    assert_eq!(opened.project_id, project.project_id);
    assert_eq!(
        opened.path,
        linked.canonicalize().unwrap().to_string_lossy()
    );
    assert_eq!(store.get_all_projects().unwrap().len(), 1);
}

#[test]
fn deletion_protects_default_and_stops_running_named_sessions_before_removal() {
    let root = tempfile::tempdir().unwrap();
    let cli = root.path().join("herdr");
    fs::write(&cli, r#"#!/bin/sh
printf '%s\n' "$*" >> "$0.calls"
case "$1 $2" in
  'session list') echo '{"sessions":[{"name":"default","default":true,"running":true},{"name":"demo","running":true},{"name":"saved","running":false}]}' ;;
  'session stop') echo '{"stopped":true}' ;;
  'session delete') echo '{"deleted":true}' ;;
esac
"#).unwrap();
    fs::set_permissions(&cli, fs::Permissions::from_mode(0o755)).unwrap();
    let control = HerdrControl::new(cli.clone());
    assert!(control.delete_session("default").is_err());
    assert!(control.delete_session("missing").is_err());
    let calls = fs::read_to_string(cli.with_extension("calls")).unwrap();
    assert!(!calls.contains("session stop"));
    assert!(!calls.contains("session delete"));
    control.delete_session("demo").unwrap();
    control.delete_session("saved").unwrap();
    let calls = fs::read_to_string(cli.with_extension("calls")).unwrap();
    assert!(calls.contains("session stop demo --json\nsession delete demo --json"));
    assert!(calls.contains("session delete saved --json"));
    assert!(!calls.contains("session stop saved"));
}

#[test]
fn closes_only_the_verified_pane() {
    use app_lib::core::herdr::control::Action;
    let root = tempfile::tempdir().unwrap();
    let directory = root.path().join("checkout");
    fs::create_dir(&directory).unwrap();
    let cli = fake_cli(root.path(), &directory);
    let control = HerdrControl::new(cli);
    let store = SkillStore::new(&root.path().join("app.db")).unwrap();
    let opened = control.open(&store, "default", "w1", None).unwrap();
    control.action(&opened.target, Action::Close, None).unwrap();
    let calls = fs::read_to_string(root.path().join("herdr.calls")).unwrap();
    assert!(calls.contains("pane close w1:p1"));
    let mut replaced = opened.target;
    replaced.terminal_id = "replaced".into();
    assert!(control.action(&replaced, Action::Close, None).is_err());
    let calls = fs::read_to_string(root.path().join("herdr.calls")).unwrap();
    assert_eq!(calls.matches("pane close").count(), 1);
}

#[test]
fn restarting_a_session_stops_only_the_selected_server_without_deleting_it() {
    let root = tempfile::tempdir().unwrap();
    let cli = fake_cli(root.path(), root.path());
    let control = HerdrControl::new(cli.clone());
    assert!(control.restart_session("missing").is_err());
    let script = r#"#!/bin/sh
printf '%s\n' "$*" >> "$0.calls"
case "$1 $2" in
  'session list') echo '{"sessions":[{"name":"default","running":true,"default":true}]}' ;;
  'session stop') echo '{"stopped":true}' ;;
  '--session default') echo '{"result":{"workspaces":[]}}' ;;
esac
"#;
    fs::write(&cli, script).unwrap();
    control.restart_session("default").unwrap();
    let calls = fs::read_to_string(cli.with_extension("calls")).unwrap();
    assert!(calls.contains("session stop default --json"));
    assert!(calls.contains("--session default workspace list"));
    assert!(!calls.contains("session delete"));
}

#[test]
fn attachment_recovers_a_closed_pane_in_the_same_checkout_without_replaying_actions() {
    use app_lib::core::herdr::control::Action;
    let root = tempfile::tempdir().unwrap();
    let directory = root.path().join("checkout");
    fs::create_dir(&directory).unwrap();
    let control = HerdrControl::new(fake_cli(root.path(), &directory));
    let store = SkillStore::new(&root.path().join("app.db")).unwrap();
    let opened = control.open(&store, "default", "w1", None).unwrap();
    let file = root.path().join("herdr.snapshot");
    let mut fixture: serde_json::Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
    fixture["result"]["snapshot"]["panes"][0]["pane_id"] = json!("w1:p2");
    fixture["result"]["snapshot"]["panes"][0]["terminal_id"] = json!("terminal-2");
    fs::write(&file, fixture.to_string()).unwrap();
    let result = control.attachment(&store, &opened.project_id, &opened.path, &opened.target);
    assert!(
        result.is_ok(),
        "Restoring the workspace client failed: {result:?}"
    );
    // A reconnect may resolve a fresh pane, but explicit actions must keep identity fencing.
    assert!(control.action(&opened.target, Action::Close, None).is_err());
    let calls = fs::read_to_string(root.path().join("herdr.calls")).unwrap();
    assert!(!calls.contains("pane close"));
    assert!(!calls.contains("agent prompt"));
    assert!(!calls.contains("workspace create"));
    assert!(!calls.contains("session stop"));
}

#[test]
fn stale_attachments_do_not_reconnect_to_a_different_checkout_or_missing_workspace() {
    let root = tempfile::tempdir().unwrap();
    let directory = root.path().join("checkout");
    let other = root.path().join("other");
    fs::create_dir(&directory).unwrap();
    fs::create_dir(&other).unwrap();
    let control = HerdrControl::new(fake_cli(root.path(), &directory));
    let store = SkillStore::new(&root.path().join("app.db")).unwrap();
    let opened = control.open(&store, "default", "w1", None).unwrap();
    let file = root.path().join("herdr.snapshot");
    let original: serde_json::Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
    for missing_workspace in [false, true] {
        let mut fixture = original.clone();
        fixture["result"]["snapshot"]["panes"][0]["terminal_id"] = json!("new-terminal");
        if missing_workspace {
            fixture["result"]["snapshot"]["workspaces"][0]["workspace_id"] = json!("w2");
            fixture["result"]["snapshot"]["panes"][0]["workspace_id"] = json!("w2");
        } else {
            fixture["result"]["snapshot"]["panes"][0]["cwd"] = json!(other);
        }
        fs::write(&file, fixture.to_string()).unwrap();
        fs::write(root.path().join("herdr.calls"), "").unwrap();
        assert!(control
            .attachment(&store, &opened.project_id, &opened.path, &opened.target)
            .is_err());
        let calls = fs::read_to_string(root.path().join("herdr.calls")).unwrap();
        assert!(
            !calls.contains(" focus "),
            "An invalid attachment changed focus: {calls}"
        );
        assert!(!calls.contains("workspace create"));
    }
}

#[test]
fn worktree_deletion_protects_local_files_and_identity_then_closes_and_removes_checkout() {
    use app_lib::core::{project_worktrees, skill_store::ProjectRecord};
    let temp = tempfile::tempdir().unwrap();
    let main = temp.path().join("main");
    let checkout = temp.path().join("topic checkout");
    let repo = git2::Repository::init(&main).unwrap();
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
    let store = SkillStore::new(&temp.path().join("store.db")).unwrap();
    store
        .insert_project(&ProjectRecord {
            id: "demo".into(),
            name: "Demo".into(),
            path: main.to_string_lossy().into_owned(),
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
    let tree = project_worktrees::create(
        &store,
        "demo",
        main.to_str().unwrap(),
        "topic",
        checkout.to_str().unwrap(),
    )
    .unwrap();
    let control = HerdrControl::new(fake_cli(temp.path(), &checkout));
    assert!(control
        .remove_worktree(&store, "default", "w1", "demo", main.to_str().unwrap())
        .is_err());
    assert!(control
        .remove_worktree(
            &store,
            "default",
            "w1",
            "demo",
            temp.path().to_str().unwrap()
        )
        .is_err());
    fs::write(checkout.join("local.txt"), "keep").unwrap();
    assert!(control
        .remove_worktree(&store, "default", "w1", "demo", &tree.path)
        .is_err());
    assert_eq!(
        fs::read_to_string(checkout.join("local.txt")).unwrap(),
        "keep"
    );
    // Even ignored files must survive a deletion attempt.
    fs::write(repo.path().join("info/exclude"), "local.txt\n").unwrap();
    assert!(control
        .remove_worktree(&store, "default", "w1", "demo", &tree.path)
        .is_err());
    fs::remove_file(checkout.join("local.txt")).unwrap();
    assert!(std::process::Command::new("git")
        .arg("-C")
        .arg(&main)
        .args(["worktree", "lock", "--", &tree.path])
        .status()
        .unwrap()
        .success());
    assert!(control
        .remove_worktree(&store, "default", "w1", "demo", &tree.path)
        .is_err());
    assert!(std::process::Command::new("git")
        .arg("-C")
        .arg(&main)
        .args(["worktree", "unlock", "--", &tree.path])
        .status()
        .unwrap()
        .success());
    // A reused workspace ID must never close a different checkout.
    fake_cli(temp.path(), &main);
    assert!(control
        .remove_worktree(&store, "default", "w1", "demo", &tree.path)
        .is_err());
    assert!(!fs::read_to_string(temp.path().join("herdr.calls"))
        .unwrap()
        .contains("workspace close"));
    fake_cli(temp.path(), &checkout);
    control
        .remove_worktree(&store, "default", "w1", "demo", &tree.path)
        .unwrap();
    assert!(!checkout.exists());
    assert!(main.exists());
    assert!(repo.find_branch("topic", git2::BranchType::Local).is_ok());
    assert_eq!(project_worktrees::list(&store, "demo").unwrap().len(), 1);
    assert!(fs::read_to_string(temp.path().join("herdr.calls"))
        .unwrap()
        .contains("--session default workspace close w1"));
}
