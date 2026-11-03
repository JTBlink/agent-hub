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
        path: None,
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
