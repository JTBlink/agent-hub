use super::*;
use crate::core::preview::{
    assets::Assets, browser::Action, documents::Documents, runtime::BrowserProfile,
};
use std::sync::Arc;
#[test]
#[ignore = "requires installed Chromium; verifies local file input and remote in-memory staging"]
fn uploads_only_selected_files_to_local_and_remote_browser_contexts() {
    let root = tempfile::tempdir().unwrap();
    let site = root.path().join("site");
    std::fs::create_dir(&site).unwrap();
    std::fs::write(
        site.join("index.html"),
        "<!doctype html><input type='file' id='upload'>",
    )
    .unwrap();
    let file = root.path().join("example.txt");
    std::fs::write(&file, "selected content").unwrap();
    let docs = Arc::new(Documents::default());
    let doc = docs.open(&site.join("index.html")).unwrap();
    let assets = Assets::start(docs).unwrap();
    let url = assets.browser_document_url(&doc.id, &doc.title);
    let browsers = Browsers::new(root.path().join("browser"));
    let local = browsers.create("default", &url).unwrap();
    let endpoint = browsers.runtime_handles().unwrap()["default"]
        .lock()
        .unwrap()
        .endpoint
        .clone();
    browsers
        .save_profile(BrowserProfile {
            id: "remote".into(),
            name: "Remote".into(),
            endpoint: Some(endpoint),
            ..BrowserProfile::default()
        })
        .unwrap();
    let remote = browsers.create("remote", &url).unwrap();
    for id in [&local, &remote] {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        loop {
            if browsers
                .action(
                    id,
                    Action::Evaluate {
                        expression: "!!document.querySelector('input')".into(),
                    },
                )
                .unwrap()
                == true
            {
                break;
            }
            assert!(std::time::Instant::now() < deadline);
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        let snapshot = browsers.action(id, Action::Snapshot).unwrap();
        let reference = snapshot["elements"]
            .as_array()
            .unwrap()
            .iter()
            .find(|element| element["tag"] == "input")
            .unwrap()["ref"]
            .as_str()
            .unwrap()
            .to_owned();
        browsers.action(id, Action::ClickRef { reference }).unwrap();
        let frame = browsers.frame(id).unwrap();
        let token = frame.info["chooser"]["token"].as_str().unwrap();
        let revision = frame.info["revision"].as_str().unwrap();
        assert!(browsers
            .upload_files(id, "stale", token, std::slice::from_ref(&file))
            .is_err());
        browsers
            .upload_files(id, revision, token, std::slice::from_ref(&file))
            .unwrap();
        let observed = browsers
            .action(
                id,
                Action::Evaluate {
                    expression: "document.querySelector('input').files[0].text()".into(),
                },
            )
            .unwrap();
        assert_eq!(observed, "selected content");
        assert_eq!(
            browsers
                .action(
                    id,
                    Action::Evaluate {
                        expression: "document.querySelector('input').files[0].type".into()
                    }
                )
                .unwrap(),
            "text/plain"
        );
        assert!(browsers
            .upload_files(id, revision, token, std::slice::from_ref(&file))
            .is_err());
        browsers
            .action(
                id,
                Action::Evaluate {
                    expression: "setTimeout(()=>alert('Page message'),0);true".into(),
                },
            )
            .unwrap();
        let frame = browsers.frame(id).unwrap();
        assert_eq!(frame.info["dialog"]["message"], "Page message");
        browsers
            .action(
                id,
                Action::HandleDialog {
                    accept: true,
                    prompt: None,
                },
            )
            .unwrap();
    }
    browsers.clear();
}
