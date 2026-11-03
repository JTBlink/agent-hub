use super::*;
use std::{
    io::Read,
    path::PathBuf,
    process::{Command, Stdio},
};

#[test]
#[ignore = "subprocess fixture; only waits when explicitly launched by lifecycle tests"]
fn owned_process_fixture() {
    if std::env::var("AGENT_HUB_PREVIEW_LIFECYCLE_CHILD").as_deref() == Ok("wait") {
        let _ = std::io::stdin().read(&mut [0u8]);
    }
}
fn process(wait: bool) -> (Arc<Mutex<OwnedChild>>, PathBuf) {
    let temporary = tempfile::tempdir().unwrap();
    let path = temporary.path().to_path_buf();
    let mut process = Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "core::preview::lifecycle::tests::owned_process_fixture",
            "--ignored",
        ])
        .env(
            "AGENT_HUB_PREVIEW_LIFECYCLE_CHILD",
            if wait { "wait" } else { "exit" },
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    if !wait {
        assert!(process.wait().unwrap().success());
    }
    (
        Arc::new(Mutex::new(OwnedChild {
            process,
            _temporary_profile: Some(temporary),
        })),
        path,
    )
}
#[test]
fn reaps_an_exited_child_but_skips_startup_recovery_and_busy_download_transactions() {
    let root = tempfile::tempdir().unwrap();
    let browsers = Browsers::new(root.path().into());
    let (child, directory) = process(false);
    {
        let mut state = browsers.state.lock().unwrap();
        state.processes.insert("guest".into(), child);
        state.pending.insert("opening".into(), "guest".into());
    }
    browsers.reap_exited();
    assert!(directory.exists());
    {
        let mut state = browsers.state.lock().unwrap();
        state.pending.clear();
        state
            .reopening_profiles
            .insert("guest".into(), "original".into());
    }
    browsers.reap_exited();
    assert!(directory.exists());
    {
        let mut state = browsers.state.lock().unwrap();
        state.reopening_profiles.clear();
        state.attaching.insert(("guest".into(), "target".into()));
    }
    browsers.reap_exited();
    assert!(directory.exists());
    browsers.state.lock().unwrap().attaching.clear();
    let transaction = browsers.downloads_gate.lock().unwrap();
    browsers.reap_exited();
    assert!(directory.exists());
    drop(transaction);
    browsers.reap_exited();
    assert!(!directory.exists());
    assert!(browsers.state.lock().unwrap().processes.is_empty());
}
#[test]
fn a_stale_exit_observation_cannot_retire_a_replacement_process() {
    let root = tempfile::tempdir().unwrap();
    let browsers = Browsers::new(root.path().into());
    let (old, old_directory) = process(false);
    let observed = HashMap::from([("guest".into(), old)]);
    let (current, directory) = process(true);
    browsers
        .state
        .lock()
        .unwrap()
        .processes
        .insert("guest".into(), current.clone());
    browsers.reap_observed(&observed);
    assert!(Arc::ptr_eq(
        &browsers.state.lock().unwrap().processes["guest"],
        &current
    ));
    assert!(current
        .lock()
        .unwrap()
        .process
        .try_wait()
        .unwrap()
        .is_none());
    assert!(directory.exists());
    assert!(old_directory.exists());
    browsers.clear();
    drop(current);
    drop(observed);
    assert!(!directory.exists());
    assert!(!old_directory.exists());
}

#[test]
#[ignore = "requires installed Chromium; background cleanup runs without any frame or inventory polling"]
fn background_reaping_clears_guest_data_keeps_recoverable_tabs_and_preserves_persistent_profiles() {
    use crate::core::preview::{
        assets::Assets, browser::Action, documents::Documents, downloads::Download,
    };
    use std::time::{Duration, Instant};
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("index.html");
    std::fs::write(&source, "<!doctype html><title>Lifecycle</title><input>").unwrap();
    let docs = Arc::new(Documents::default());
    let doc = docs.open(&source).unwrap();
    let assets = Assets::start(docs).unwrap();
    let url = assets.browser_document_url(&doc.id, &doc.title);
    let browsers = Browsers::shared(root.path().join("browser"));
    let guest = browsers.create_owned("guest", &url, "guest-owner").unwrap();
    let other = browsers.create_owned("guest", &url, "other-owner").unwrap();
    let persistent = browsers
        .create_owned("default", &url, "persistent-owner")
        .unwrap();
    for id in [&guest, &other, &persistent] {
        let deadline = Instant::now() + Duration::from_secs(8);
        loop {
            if browsers
                .action(
                    id,
                    Action::Evaluate {
                        expression: "Boolean(document.querySelector('input'))".into(),
                    },
                )
                .unwrap()
                == true
            {
                break;
            }
            assert!(Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(30));
        }
        browsers.frame(id).unwrap();
    }
    browsers.action(&guest, Action::Evaluate { expression: "localStorage.setItem('private','guest');document.querySelector('input').value='unsent'".into() }).unwrap();
    let temporary = {
        let mut state = browsers.state.lock().unwrap();
        for (id, profile, status) in [
            ("active", "guest", "inProgress"),
            ("completed", "guest", "completed"),
            ("other", "default", "inProgress"),
        ] {
            state.downloads.insert(
                format!("{profile}:{id}"),
                Download {
                    id: id.into(),
                    profile: profile.into(),
                    name: "artifact".into(),
                    state: status.into(),
                    received: 10.,
                    total: 20.,
                    local: true,
                    verified: true,
                    path: None,
                    ..Download::default()
                },
            );
        }
        let mut child = state.processes["guest"].lock().unwrap();
        let path = child
            ._temporary_profile
            .as_ref()
            .unwrap()
            .path()
            .to_path_buf();
        child.process.kill().unwrap();
        child.process.wait().unwrap();
        path
    };
    // No list(), frame() or action() while waiting: the production worker must perform cleanup.
    let deadline = Instant::now() + Duration::from_secs(10);
    while temporary.exists() {
        assert!(
            Instant::now() < deadline,
            "temporary profile was not released"
        );
        std::thread::sleep(Duration::from_millis(30));
    }
    {
        let state = browsers.state.lock().unwrap();
        assert!(!state.runtimes.contains_key("guest"));
        assert!(!state.processes.contains_key("guest"));
        for (id, owner) in [(&guest, "guest-owner"), (&other, "other-owner")] {
            assert!(state.lost_pages.contains(id));
            let metadata = state.pages[id].metadata.lock().unwrap();
            assert_eq!(metadata.status, PageStatus::Gone);
            assert_eq!(metadata.owner.as_deref(), Some(owner));
            assert_eq!(metadata.url, url);
        }
        assert_eq!(state.downloads["guest:active"].state, "interrupted");
        assert!(!state.downloads["guest:active"].verified);
        assert_eq!(state.downloads["guest:completed"].state, "completed");
        assert!(state.downloads["guest:completed"].verified);
        assert_eq!(state.downloads["default:other"].state, "inProgress");
        assert!(state.processes["default"]
            .lock()
            .unwrap()
            .process
            .try_wait()
            .unwrap()
            .is_none());
    }
    browsers.reopen(&guest).unwrap();
    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        if browsers
            .action(
                &guest,
                Action::Evaluate {
                    expression: "Boolean(document.querySelector('input'))".into(),
                },
            )
            .unwrap()
            == true
        {
            break;
        }
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(30));
    }
    assert_eq!(
        browsers
            .action(
                &guest,
                Action::Evaluate {
                    expression:
                        "[localStorage.getItem('private'),document.querySelector('input').value]"
                            .into()
                }
            )
            .unwrap(),
        serde_json::json!([null, ""])
    );
    browsers
        .page(&guest)
        .unwrap()
        .lock()
        .unwrap()
        .metadata
        .lock()
        .unwrap()
        .status = PageStatus::Gone;
    assert!(
        browsers.frame(&guest).is_err(),
        "late frames must not revive a known lost page"
    );
    browsers.page(&guest).unwrap().lock().unwrap().cdp.dialog =
        Some(serde_json::json!({"type":"alert","message":"cached dialog"}));
    assert!(
        browsers.frame(&guest).is_err(),
        "cached dialogs must not revive a known lost page"
    );
    let persistent_directory = root.path().join("browser/profiles/default");
    let marker = persistent_directory.join("retained-marker");
    std::fs::write(&marker, "persistent data").unwrap();
    {
        let state = browsers.state.lock().unwrap();
        let mut child = state.processes["default"].lock().unwrap();
        child.process.kill().unwrap();
        child.process.wait().unwrap();
    }
    let deadline = Instant::now() + Duration::from_secs(10);
    while browsers
        .state
        .lock()
        .unwrap()
        .runtimes
        .contains_key("default")
    {
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(30));
    }
    assert_eq!(std::fs::read_to_string(marker).unwrap(), "persistent data");
    browsers.reopen(&persistent).unwrap();
    browsers.close(&other).unwrap();
    browsers.clear();
}
