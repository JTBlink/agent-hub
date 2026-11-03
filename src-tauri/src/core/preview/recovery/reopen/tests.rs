use super::*;
use crate::core::preview::{
    assets::Assets,
    automation::{self, Automation, ControlEndpoint},
    browser::Action,
    documents::Documents,
    downloads::Download,
    runtime::BrowserProfile,
};
use std::time::{Duration, Instant};
fn wait_ready(browsers: &Browsers, id: &str) {
    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        if browsers.action(id,Action::Evaluate{expression:"Boolean(document.querySelector('input')) && document.readyState === 'complete'".into()}).unwrap()==true {break;}
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(30));
    }
}
#[test]
#[ignore = "requires installed Chromium; validates explicit page/process/context replacement and persistent/guest login semantics"]
fn reopens_live_exited_and_disposed_pages_without_replaying_forms_or_losing_logical_ids() {
    for mode in ["live", "persistent", "guest", "paired"] {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("index.html");
        std::fs::write(&path,"<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'><title>Reopen</title><input><button onclick='window.clicks=(window.clicks||0)+1'>Submit</button>").unwrap();
        let docs = Arc::new(Documents::default());
        let doc = docs.open(&path).unwrap();
        let assets = Assets::start(docs).unwrap();
        let url = assets.browser_document_url(&doc.id, &doc.title);
        let host = Browsers::new(root.path().join("host"));
        let host_page = if mode == "paired" {
            Some(host.create("default", "about:blank").unwrap())
        } else {
            None
        };
        let browsers = Arc::new(Browsers::new(root.path().join("client")));
        let profile = if mode == "paired" {
            let endpoint = host.runtime_handles().unwrap()["default"]
                .lock()
                .unwrap()
                .endpoint
                .clone();
            browsers
                .save_profile(BrowserProfile {
                    id: "paired".into(),
                    name: "Paired".into(),
                    endpoint: Some(endpoint),
                    ..BrowserProfile::default()
                })
                .unwrap();
            "paired"
        } else if mode == "guest" {
            "guest"
        } else {
            "default"
        };
        let id = browsers.create_owned(profile, &url, "gui-tab").unwrap();
        wait_ready(&browsers, &id);
        let mut others = Vec::new();
        if mode == "persistent" {
            for _ in 0..11 {
                others.push(browsers.create(profile, "about:blank").unwrap());
            }
        }
        browsers
            .action(
                &id,
                Action::Resize {
                    width: 700,
                    height: 600,
                    mobile: false,
                },
            )
            .unwrap();
        let origin=browsers.action(&id,Action::Evaluate{expression:"localStorage.setItem('persist','profile-data');document.cookie='login=profile;max-age=3600;path=/';document.querySelector('input').value='unsent form';document.querySelector('button').click();performance.timeOrigin".into()}).unwrap();
        let old_frame = browsers.frame(&id).unwrap();
        let runtime = browsers.runtime_handles().unwrap()[profile].clone();
        if mode == "paired" {
            let mut runtime = runtime.lock().unwrap();
            let context = runtime.context.clone().unwrap();
            runtime
                .cdp
                .call(
                    "Target.disposeBrowserContext",
                    json!({"browserContextId":context}),
                )
                .unwrap();
        } else if mode != "live" {
            let _ = runtime.lock().unwrap().cdp.call("Browser.close", json!({}));
            let deadline = Instant::now() + Duration::from_secs(8);
            while !runtime.lock().unwrap().owned_process_exited().unwrap() {
                assert!(Instant::now() < deadline);
                std::thread::sleep(Duration::from_millis(30));
            }
            let item = Download {
                id: "old-download".into(),
                profile: profile.into(),
                name: "partial.bin".into(),
                state: "inProgress".into(),
                received: 10.,
                total: 20.,
                local: true,
                verified: false,
                path: None,
                ..Download::default()
            };
            browsers
                .state
                .lock()
                .unwrap()
                .downloads
                .insert(format!("{profile}:old-download"), item);
        }
        if mode != "live" {
            let observed = browsers.list().unwrap();
            assert_eq!(observed.len(), others.len() + 1);
            assert!(observed.iter().all(|page| page.status == PageStatus::Gone));
        }
        let server = Automation::start(browsers.clone()).unwrap();
        let endpoint: ControlEndpoint = serde_json::from_slice(
            &std::fs::read(root.path().join("client/control.json")).unwrap(),
        )
        .unwrap();
        automation::call(&endpoint, json!({"kind":"reopen","id":id})).unwrap();
        wait_ready(&browsers, &id);
        let value=browsers.action(&id,Action::Evaluate{expression:"({form:document.querySelector('input').value,clicks:window.clicks||0,origin:performance.timeOrigin,storage:localStorage.getItem('persist'),cookie:document.cookie,width:innerWidth,height:innerHeight})".into()}).unwrap();
        assert_eq!(value["form"], "");
        assert_eq!(value["clicks"], 0);
        assert_ne!(value["origin"], origin);
        assert_eq!(value["width"], 700);
        assert_eq!(value["height"], 600);
        if matches!(mode, "live" | "persistent") {
            assert_eq!(value["storage"], "profile-data");
            assert!(value["cookie"].as_str().unwrap().contains("login=profile"));
        } else {
            assert!(value["storage"].is_null());
            assert_eq!(value["cookie"], "");
        }
        let frame = browsers.frame_since(&id, Some(old_frame.version)).unwrap();
        assert!(frame.version > old_frame.version);
        assert!(!frame.image.is_empty());
        let pages = browsers.list().unwrap();
        assert_eq!(pages.len(), others.len() + 1);
        assert_eq!(
            pages
                .iter()
                .find(|page| page.id == id)
                .unwrap()
                .owner
                .as_deref(),
            Some("gui-tab")
        );
        assert!(pages
            .iter()
            .filter(|page| page.id != id)
            .all(|page| page.status == PageStatus::Gone));
        for other in others {
            browsers.close(&other).unwrap();
        }
        if matches!(mode, "persistent" | "guest") {
            let downloads = browsers.downloads().unwrap();
            assert_eq!(downloads[0].state, "interrupted");
            browsers.forget_download(profile, "old-download").unwrap();
        }
        if let Some(host_page) = host_page {
            assert_eq!(
                host.action(
                    &host_page,
                    Action::Evaluate {
                        expression: "location.href".into()
                    }
                )
                .unwrap(),
                "about:blank"
            );
        }
        browsers.clear();
        drop(server);
        host.clear();
    }
}
#[test]
#[ignore = "requires installed Chromium; verifies failed restart remains retryable after executable repair"]
fn retries_a_failed_process_restart_without_requiring_the_old_runtime() {
    let root = tempfile::tempdir().unwrap();
    let browsers = Browsers::new(root.path().into());
    let profile = BrowserProfile {
        id: "repair".into(),
        name: "Repair".into(),
        ..BrowserProfile::default()
    };
    browsers.save_profile(profile.clone()).unwrap();
    let id = browsers.create("repair", "about:blank").unwrap();
    let runtime = browsers.runtime_handles().unwrap()["repair"].clone();
    let child = browsers.state.lock().unwrap().processes["repair"].clone();
    {
        let mut child = child.lock().unwrap();
        child.process.kill().unwrap();
        child.process.wait().unwrap();
    }
    assert!(runtime.lock().unwrap().owned_process_exited().unwrap());
    let broken = BrowserProfile {
        executable: Some(
            root.path()
                .join("missing-browser")
                .to_string_lossy()
                .into_owned(),
        ),
        ..profile.clone()
    };
    std::fs::write(
        root.path().join("profiles.json"),
        serde_json::to_vec(&vec![broken]).unwrap(),
    )
    .unwrap();
    assert!(browsers.reopen(&id).is_err());
    assert!(browsers.runtime_handles().unwrap().is_empty());
    assert!(browsers.state.lock().unwrap().reopening_profiles.is_empty());
    assert_eq!(browsers.list().unwrap()[0].status, PageStatus::Gone);
    assert!(browsers.delete_profile("repair").is_err());
    browsers.save_profile(profile).unwrap();
    browsers.reopen(&id).unwrap();
    assert_eq!(browsers.list().unwrap().len(), 1);
    assert!(browsers.state.lock().unwrap().lost_pages.is_empty());
    browsers.clear();
}

#[test]
#[ignore = "requires installed Chromium; deterministic profile lifecycle exclusion for close/reopen"]
fn close_and_reopen_hold_the_same_profile_lifecycle_lease() {
    let root = tempfile::tempdir().unwrap();
    let browsers = Arc::new(Browsers::new(root.path().into()));
    let id = browsers.create("default", "about:blank").unwrap();
    let runtime = browsers.runtime_handles().unwrap()["default"].clone();
    let guard = runtime.lock().unwrap();
    let worker = {
        let browsers = browsers.clone();
        let id = id.clone();
        std::thread::spawn(move || browsers.close(&id))
    };
    let deadline = Instant::now() + Duration::from_secs(3);
    while !browsers
        .state
        .lock()
        .unwrap()
        .reopening_profiles
        .contains_key("default")
    {
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(browsers
        .reopen(&id)
        .unwrap_err()
        .message
        .contains("PREVIEW_REOPEN_BUSY"));
    drop(guard);
    worker.join().unwrap().unwrap();
    let id = browsers.create("default", "about:blank").unwrap();
    let attempt = browsers.reserve_reopen(&id).unwrap();
    assert!(browsers
        .close(&id)
        .unwrap_err()
        .message
        .contains("PREVIEW_REOPEN_BUSY"));
    drop(attempt);
    browsers.close(&id).unwrap();
    browsers.clear();
}
#[test]
#[ignore = "requires installed Chromium; faults navigation and cleanup on separate native CDP transports"]
fn keeps_the_replacement_under_its_original_id_if_setup_and_cleanup_both_fail() {
    use std::io::Read;
    let root = tempfile::tempdir().unwrap();
    let browsers = Browsers::new(root.path().into());
    let id = browsers
        .create_owned("default", "about:blank", "gui-tab")
        .unwrap();
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let url = format!("http://{}/", listener.local_addr().unwrap());
    browsers.state.lock().unwrap().pages[&id]
        .metadata
        .lock()
        .unwrap()
        .url = url.clone();
    let runtime = browsers.runtime_handles().unwrap()["default"].clone();
    let breaker = std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(8);
        let mut stream = loop {
            match listener.accept() {
                Ok((stream, _)) => break stream,
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    assert!(Instant::now() < deadline);
                    std::thread::sleep(Duration::from_millis(10));
                }
                Err(error) => panic!("{error}"),
            }
        };
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        let _ = stream.read(&mut [0; 1]);
        runtime.lock().unwrap().cdp.close();
        drop(stream);
    });
    let error = browsers.reopen(&id).unwrap_err();
    breaker.join().unwrap();
    assert!(error.message.contains("PREVIEW_REOPEN_UNCERTAIN"));
    let pages = browsers.list().unwrap();
    assert_eq!(pages.len(), 1);
    assert_eq!(pages[0].id, id);
    assert_eq!(pages[0].owner.as_deref(), Some("gui-tab"));
    assert_eq!(pages[0].status, PageStatus::Unverified);
    assert!(browsers.state.lock().unwrap().pending_targets.is_empty());
    browsers.reconnect(&id).unwrap();
    assert_eq!(browsers.frame(&id).unwrap().info["url"], url);
    assert_eq!(browsers.list().unwrap()[0].url, url);
    let targets = browsers.runtime_handles().unwrap()["default"]
        .lock()
        .unwrap()
        .cdp
        .call("Target.getTargets", json!({}))
        .unwrap();
    assert_eq!(
        targets["targetInfos"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|target| target["type"] == "page")
            .count(),
        1
    );
    browsers.close(&id).unwrap();
    browsers.clear();
}
