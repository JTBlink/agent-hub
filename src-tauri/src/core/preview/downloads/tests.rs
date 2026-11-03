use super::*;
#[test]
fn concurrent_poll_reads_committed_downloads_without_draining_events() {
    let root = tempfile::tempdir().unwrap();
    let browsers = Browsers::new(root.path().into());
    let item = Download {
        id: "item".into(),
        profile: "default".into(),
        name: "download".into(),
        state: "completed".into(),
        received: 10.,
        total: 10.,
        local: true,
        verified: true,
        path: None,
        ..Download::default()
    };
    browsers
        .state
        .lock()
        .unwrap()
        .downloads
        .insert("default:item".into(), item);
    let _transaction = browsers.downloads_gate.lock().unwrap();
    let snapshot = browsers.downloads().unwrap();
    assert_eq!(snapshot.len(), 1);
    assert_eq!(snapshot[0].state, "completed");
}

#[test]
fn forgetting_records_keeps_files_and_refuses_unverified_active_downloads() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("download.bin");
    std::fs::write(&path, b"downloaded bytes").unwrap();
    let browsers = Browsers::new(root.path().into());
    let item = Download {
        id: "item".into(),
        profile: "default".into(),
        name: "download.bin".into(),
        state: "inProgress".into(),
        received: 10.,
        total: 20.,
        local: true,
        verified: false,
        path: Some(path.clone()),
        ..Download::default()
    };
    browsers
        .state
        .lock()
        .unwrap()
        .downloads
        .insert("default:item".into(), item);
    assert!(browsers.forget_download("default", "item").is_err());
    browsers
        .state
        .lock()
        .unwrap()
        .downloads
        .get_mut("default:item")
        .unwrap()
        .state = "completed".into();
    browsers.forget_download("default", "item").unwrap();
    assert_eq!(std::fs::read(path).unwrap(), b"downloaded bytes");
    assert!(browsers.downloads().unwrap().is_empty());
}

#[test]
#[ignore = "requires installed Chromium; verifies interrupted download observation without touching user browsers"]
fn keeps_progress_but_marks_it_unverified_when_the_control_connection_fails() {
    let root = tempfile::tempdir().unwrap();
    let browsers = Browsers::new(root.path().into());
    browsers.create("default", "about:blank").unwrap();
    let item = Download {
        id: "item".into(),
        profile: "default".into(),
        name: "download.bin".into(),
        state: "inProgress".into(),
        received: 10.,
        total: 20.,
        local: true,
        verified: true,
        path: None,
        ..Download::default()
    };
    browsers
        .state
        .lock()
        .unwrap()
        .downloads
        .insert("default:item".into(), item);
    browsers.runtime_handles().unwrap()["default"]
        .lock()
        .unwrap()
        .cdp
        .close();
    let downloads = browsers.downloads().unwrap();
    assert!(!downloads[0].verified);
    assert_eq!(downloads[0].state, "inProgress");
    assert_eq!(downloads[0].received, 10.);
    assert!(browsers.forget_download("default", "item").is_err());
    browsers.clear();
}

#[test]
fn unknown_progress_does_not_invent_a_terminal_state_or_reset_known_byte_counts() {
    let mut item = Download {
        state: "inProgress".into(),
        received: 10.,
        total: 20.,
        verified: true,
        ..Download::default()
    };
    item.observe_progress(&serde_json::json!({"state":"unrecognized","receivedBytes":100}));
    assert_eq!(item.state, "inProgress");
    assert_eq!(item.received, 10.);
    assert!(!item.verified);
    item.observe_progress(
        &serde_json::json!({"state":"completed","receivedBytes":-1,"totalBytes":20}),
    );
    assert_eq!(item.state, "completed");
    assert_eq!(item.received, 10.);
    assert!(item.verified);
}
