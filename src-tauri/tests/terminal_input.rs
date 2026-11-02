#![cfg(unix)]

use app_lib::core::terminal::{TerminalEvent, TerminalManager, TerminalSize, TerminalSpec};
use base64::{engine::general_purpose::STANDARD, Engine};
use portable_pty::CommandBuilder;
use std::{sync::mpsc, time::Duration};

#[test]
fn delivers_a_burst_of_keystrokes_to_the_real_pty_without_loss() {
    let manager = TerminalManager::default();
    let directory = tempfile::tempdir().unwrap();
    let mut command = CommandBuilder::new("/bin/sh");
    command.args([
        "-c",
        "stty -echo raw; printf READY; dd bs=1 count=600 2>/dev/null",
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
    let mut output = Vec::new();
    while !output.ends_with(b"READY") {
        if let TerminalEvent::Output { seq, data } =
            receiver.recv_timeout(Duration::from_secs(5)).unwrap()
        {
            output.extend(STANDARD.decode(data).unwrap());
            manager.ack("main", &session.id, seq).unwrap();
        }
    }
    output.clear();
    let expected = "0123456789".repeat(60);
    for byte in expected.bytes() {
        manager.write("main", &session.id, vec![byte]).unwrap();
    }
    loop {
        match receiver.recv_timeout(Duration::from_secs(5)).unwrap() {
            TerminalEvent::Output { seq, data } => {
                output.extend(STANDARD.decode(data).unwrap());
                manager.ack("main", &session.id, seq).unwrap();
            }
            TerminalEvent::Exit { code } => {
                assert_eq!(code, 0);
                break;
            }
            TerminalEvent::Error { message } => panic!("{message}"),
        }
    }
    manager.close("main", &session.id).unwrap();
    assert_eq!(output, expected.as_bytes());
}

#[test]
fn closing_a_congested_terminal_releases_its_waiting_input_writer() {
    let manager = std::sync::Arc::new(TerminalManager::default());
    let directory = tempfile::tempdir().unwrap();
    let mut command = CommandBuilder::new("/bin/sh");
    command.args(["-c", "stty -echo raw; printf READY; sleep 30"]);
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
    let mut output = Vec::new();
    while !output.ends_with(b"READY") {
        if let TerminalEvent::Output { seq, data } =
            receiver.recv_timeout(Duration::from_secs(5)).unwrap()
        {
            output.extend(STANDARD.decode(data).unwrap());
            manager.ack("main", &session.id, seq).unwrap();
        }
    }
    let (progress, received) = mpsc::channel();
    let writing = manager.clone();
    let id = session.id.clone();
    let worker = std::thread::spawn(move || loop {
        let result = writing.write("main", &id, vec![b'x'; 8192]);
        let failed = result.is_err();
        progress.send(result).unwrap();
        if failed {
            break;
        }
    });
    // Once the OS input buffer and bounded queue fill, writes must wait.
    loop {
        match received.recv_timeout(Duration::from_millis(100)) {
            Ok(result) => result.expect("Congestion must not reject input"),
            Err(mpsc::RecvTimeoutError::Timeout) => break,
            Err(error) => panic!("Input writer exited before close: {error}"),
        }
    }
    let started = std::time::Instant::now();
    manager.close("main", &session.id).unwrap();
    assert!(started.elapsed() < Duration::from_secs(2));
    assert!(received
        .recv_timeout(Duration::from_secs(2))
        .unwrap()
        .is_err());
    worker.join().unwrap();
    assert!(manager.list("main").unwrap().is_empty());
}
