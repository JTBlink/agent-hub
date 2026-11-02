#![cfg(unix)]
use app_lib::core::terminal::{
    prepare_shell, TerminalEvent, TerminalManager, TerminalSize, TerminalSpec,
};
use std::{os::unix::fs::PermissionsExt, path::Path, sync::mpsc, time::Duration};

#[test]
fn shortcut_requires_verified_prompt_and_unchanged_input() {
    verify_shell_launch("/bin/bash");
}

#[test]
fn zsh_shortcut_launches_at_verified_prompt() {
    if Path::new("/bin/zsh").exists() {
        verify_shell_launch("/bin/zsh");
    }
}

fn verify_shell_launch(program: &str) {
    let directory = tempfile::tempdir().unwrap();
    std::fs::write(directory.path().join(".bashrc"), "PROMPT_COMMAND='true;'\n").unwrap();
    let executable = directory.path().join("fake herdr");
    std::fs::write(
        &executable,
        r##"#!/bin/sh
printf '%s\n' "$@" >> "$0.log"
case "$3 $4" in
  'session list') echo '{"sessions":[{"name":"default","running":true}]}' ;;
  'workspace list') echo '{"result":{"workspaces":[]}}' ;;
  'workspace create') echo '{"result":{"workspace":{"workspace_id":"w-project"}}}' ;;
  'workspace focus') echo '{"result":{}}' ;;
  *) exit 0 ;;
esac
"##,
    )
    .unwrap();
    std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o700)).unwrap();
    let (command, integration) =
        prepare_shell(Some(Path::new(program)), Some(directory.path())).unwrap();
    let manager = TerminalManager::default();
    let (tx, rx) = mpsc::channel();
    let session = manager
        .create(
            "main",
            TerminalSpec {
                project_id: "demo".into(),
                cwd: directory.path().into(),
                command,
                integration: Some(integration),
                size: TerminalSize { rows: 24, cols: 80 },
            },
            move |event| tx.send(event).is_ok(),
        )
        .unwrap();
    loop {
        let event = rx.recv_timeout(Duration::from_secs(5)).unwrap();
        if let TerminalEvent::Output { seq, .. } = event {
            manager.ack("main", &session.id, seq).unwrap();
        }
        if manager.launch_state("main", &session.id).unwrap().ready {
            break;
        }
    }
    let initial = manager.launch_state("main", &session.id).unwrap();
    assert!(manager
        .launch_herdr("main", &session.id, &executable, initial.revision)
        .unwrap());
    loop {
        let event = rx.recv_timeout(Duration::from_secs(5)).unwrap();
        if let TerminalEvent::Output { seq, .. } = event {
            manager.ack("main", &session.id, seq).unwrap();
        }
        let state = manager.launch_state("main", &session.id).unwrap();
        if state.ready && !state.herdr_active {
            break;
        }
    }
    let log = std::fs::read_to_string(executable.with_extension("log")).unwrap();
    assert!(log.contains(&format!(
        "\n--cwd\n{}\n",
        directory.path().canonicalize().unwrap().display()
    )));
    assert!(log.contains("\nfocus\nw-project\n"));
    assert!(log.ends_with("--session\ndefault\n"));
    let state = manager.launch_state("main", &session.id).unwrap();
    manager
        .write("main", &session.id, b"unfinished".to_vec())
        .unwrap();
    manager
        .write("main", &session.id, b"\x0c".to_vec())
        .unwrap();
    while let Ok(event) = rx.recv_timeout(Duration::from_millis(150)) {
        if let TerminalEvent::Output { seq, .. } = event {
            manager.ack("main", &session.id, seq).unwrap();
        }
    }
    let redrawn = manager.launch_state("main", &session.id).unwrap();
    assert!(
        !redrawn.ready,
        "Prompt redraw must not authorize an existing draft"
    );
    assert!(manager
        .launch_herdr("main", &session.id, &executable, state.revision)
        .is_err());
    manager.close("main", &session.id).unwrap();
}
