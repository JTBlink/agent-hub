#![cfg(unix)]

use app_lib::core::terminal::{TerminalEvent, TerminalManager, TerminalSize, TerminalSpec};
use base64::{engine::general_purpose::STANDARD, Engine};
use portable_pty::CommandBuilder;
use std::{sync::mpsc, time::Duration};

#[test]
fn reserves_capacity_before_program_preparation_and_releases_failed_requests() {
    fn reserve(manager: &TerminalManager, depth: usize) {
        let result = manager.create_with(
            "main",
            || {
                assert!(
                    depth < 8,
                    "External startup must not run beyond terminal capacity"
                );
                if depth == 7 {
                    let mut prepared_other = false;
                    let _ = manager.create_with(
                        "workspace-other",
                        || {
                            prepared_other = true;
                            anyhow::bail!("preparation failed")
                        },
                        |_| true,
                    );
                    assert!(
                        prepared_other,
                        "Each workspace has its own terminal capacity"
                    );
                }
                reserve(manager, depth + 1);
                anyhow::bail!("preparation failed")
            },
            |_| true,
        );
        assert!(result.is_err());
    }
    let manager = TerminalManager::default();
    reserve(&manager, 0);
    let mut prepared = false;
    let result = manager.create_with(
        "main",
        || {
            prepared = true;
            anyhow::bail!("preparation failed")
        },
        |_| true,
    );
    assert!(result.is_err());
    assert!(
        prepared,
        "Failed preparation must release all reserved slots"
    );
}

#[test]
fn project_terminal_accepts_input_resizes_and_reports_real_exit() {
    let manager = TerminalManager::default();
    let directory = tempfile::tempdir().unwrap();
    let mut command = CommandBuilder::new("/bin/sh");
    command.args([
        "-c",
        "read value; stty size; printf '收到:%s' \"$value\"; exit 7",
    ]);
    let (sender, receiver) = mpsc::channel();
    let session = manager
        .create(
            "main",
            TerminalSpec {
                project_id: "demo".into(),
                cwd: directory.path().into(),
                command,
                integration: None,
                size: TerminalSize { rows: 24, cols: 80 },
            },
            move |event| sender.send(event).is_ok(),
        )
        .unwrap();
    manager
        .resize(
            "main",
            &session.id,
            TerminalSize {
                rows: 30,
                cols: 100,
            },
        )
        .unwrap();
    manager
        .write("main", &session.id, b"hello\n".to_vec())
        .unwrap();
    let mut output = Vec::new();
    loop {
        match receiver.recv_timeout(Duration::from_secs(5)).unwrap() {
            TerminalEvent::Output { seq, data } => {
                output.extend(STANDARD.decode(data).unwrap());
                manager.ack("main", &session.id, seq).unwrap();
            }
            TerminalEvent::Exit { code } => {
                assert_eq!(code, 7);
                break;
            }
            TerminalEvent::Error { message } => panic!("{message}"),
        }
    }
    let text = String::from_utf8(output).unwrap();
    assert!(text.contains("30 100"), "{text}");
    assert!(text.contains("收到:hello"), "{text}");
    assert!(manager
        .write("other-window", &session.id, b"no".to_vec())
        .is_err());
    manager.close("main", &session.id).unwrap();
    assert!(manager.write("main", &session.id, b"no".to_vec()).is_err());
    assert!(manager.list("main").unwrap().is_empty());
}

#[test]
fn closing_a_flooding_terminal_is_bounded_and_does_not_close_its_neighbor() {
    let manager = TerminalManager::default();
    let directory = tempfile::tempdir().unwrap();
    let mut flood = CommandBuilder::new("/bin/sh");
    flood.env_remove("ENV");
    flood.env(
        "BACKGROUND_PID_FILE",
        directory.path().join("background.pid"),
    );
    flood.args(["-i", "-m", "-c", "sleep 30 & printf '%s' \"$!\" > \"$BACKGROUND_PID_FILE\"; while :; do printf '0123456789abcdef'; done"]);
    let (tx, rx) = mpsc::channel();
    let first = manager
        .create(
            "main",
            TerminalSpec {
                project_id: "demo".into(),
                cwd: directory.path().into(),
                command: flood,
                integration: None,
                size: TerminalSize { rows: 24, cols: 80 },
            },
            move |event| tx.send(event).is_ok(),
        )
        .unwrap();
    let mut waiting = CommandBuilder::new("/bin/sh");
    waiting.args(["-c", "read value; printf 'neighbor:%s' \"$value\""]);
    let (tx, neighbor) = mpsc::channel();
    let second = manager
        .create(
            "main",
            TerminalSpec {
                project_id: "demo".into(),
                cwd: directory.path().into(),
                command: waiting,
                integration: None,
                size: TerminalSize { rows: 24, cols: 80 },
            },
            move |event| tx.send(event).is_ok(),
        )
        .unwrap();
    let mut delivered = 0;
    while let Ok(TerminalEvent::Output { data, .. }) = rx.recv_timeout(Duration::from_millis(200)) {
        delivered += STANDARD.decode(data).unwrap().len();
        assert!(delivered <= 256 * 1024, "unbounded output: {delivered}");
    }
    assert!(delivered > 0);
    assert!(manager.ack("other", &first.id, 1).is_err());
    let background_pid = std::fs::read_to_string(directory.path().join("background.pid")).unwrap();
    let pid: libc::pid_t = background_pid.trim().parse().unwrap();
    assert_eq!(
        unsafe { libc::getpgid(pid) },
        pid,
        "Fixture must exercise a separate job-control group"
    );
    let start = std::time::Instant::now();
    manager.close("main", &first.id).unwrap();
    assert!(start.elapsed() < Duration::from_secs(1));
    let deadline = std::time::Instant::now() + Duration::from_secs(2);
    loop {
        let output = std::process::Command::new("/bin/ps")
            .args(["-p", background_pid.trim(), "-o", "stat="])
            .output()
            .unwrap();
        let state = String::from_utf8_lossy(&output.stdout);
        if state.trim().is_empty() || state.trim().starts_with('Z') {
            break;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "Owned background job survived close"
        );
        std::thread::sleep(Duration::from_millis(10));
    }

    manager
        .write("main", &second.id, b"alive\n".to_vec())
        .unwrap();
    let mut output = Vec::new();
    loop {
        match neighbor.recv_timeout(Duration::from_secs(5)).unwrap() {
            TerminalEvent::Output { seq, data } => {
                output.extend(STANDARD.decode(data).unwrap());
                manager.ack("main", &second.id, seq).unwrap();
            }
            TerminalEvent::Exit { code } => {
                assert_eq!(code, 0);
                break;
            }
            TerminalEvent::Error { message } => panic!("{message}"),
        }
    }
    assert!(String::from_utf8(output)
        .unwrap()
        .contains("neighbor:alive"));
    manager.close("main", &second.id).unwrap();
}

#[test]
fn closing_one_workspace_preserves_other_windows_and_cancels_pending_launches() {
    let manager = TerminalManager::default();
    let directory = tempfile::tempdir().unwrap();
    let spec = || TerminalSpec {
        project_id: "demo".into(),
        cwd: directory.path().into(),
        command: CommandBuilder::new("/bin/sh"),
        integration: None,
        size: TerminalSize { rows: 24, cols: 80 },
    };
    let main = manager.create("main", spec(), |_| true).unwrap();
    let other = manager.create("workspace-task", spec(), |_| true).unwrap();
    let pending = manager.create_with(
        "workspace-task",
        || {
            manager.close_owner("workspace-task");
            Ok(spec())
        },
        |_| true,
    );
    assert!(pending.is_err());
    assert!(manager.list("workspace-task").unwrap().is_empty());
    assert!(manager.write("workspace-task", &other.id, vec![]).is_err());
    assert_eq!(manager.list("main").unwrap()[0].id, main.id);
    assert!(manager.create("workspace-task", spec(), |_| true).is_err());
    manager.open_owner("workspace-task");
    assert!(manager.create("workspace-task", spec(), |_| true).is_ok());
    let cleanup = manager.detach_owner("workspace-task");
    manager.open_owner("workspace-task");
    let reopened = manager.create("workspace-task", spec(), |_| true).unwrap();
    cleanup();
    assert_eq!(manager.list("workspace-task").unwrap()[0].id, reopened.id);
    manager.close_all();
}
