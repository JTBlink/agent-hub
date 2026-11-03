use super::*;
use crate::core::preview::{
    assets::Assets,
    automation::{self, Automation, ControlEndpoint},
    browser::Action,
    documents::Documents,
    runtime::BrowserProfile,
};
use std::time::{Duration, Instant};
#[test]
#[ignore = "requires installed Chromium; isolated local and paired contexts verify transport recovery without input replay"]
fn reconnects_local_and_paired_pages_without_reloading_or_replaying_input() {
    for remote in [false, true] {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("index.html");
        std::fs::write(&path,"<!doctype html><title>Recovery</title><input id='field'><button onclick='window.clicks=(window.clicks||0)+1'>Submit</button>").unwrap();
        let docs = Arc::new(Documents::default());
        let doc = docs.open(&path).unwrap();
        let assets = Assets::start(docs).unwrap();
        let url = assets.browser_document_url(&doc.id, &doc.title);
        let host = Browsers::new(root.path().join("host"));
        let host_page = if remote {
            Some(host.create("default", "about:blank").unwrap())
        } else {
            None
        };
        let browsers = Arc::new(Browsers::new(root.path().join("client")));
        let profile = if remote {
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
        } else {
            "default"
        };
        let server = Automation::start(browsers.clone()).unwrap();
        let control: ControlEndpoint = serde_json::from_slice(
            &std::fs::read(root.path().join("client/control.json")).unwrap(),
        )
        .unwrap();
        let id = browsers.create(profile, &url).unwrap();
        let deadline = Instant::now() + Duration::from_secs(8);
        loop {
            if browsers
                .action(
                    &id,
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
        let before = browsers.action(&id, Action::Snapshot).unwrap();
        let reference = before["elements"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["tag"] == "input")
            .unwrap()["ref"]
            .as_str()
            .unwrap()
            .to_owned();
        let origin = browsers.action(&id,Action::Evaluate{expression:"document.querySelector('input').value='unsent draft';document.querySelector('button').click();performance.timeOrigin".into()}).unwrap();
        let previous_frame = browsers.frame(&id).unwrap();
        browsers.page(&id).unwrap().lock().unwrap().cdp.close();
        browsers.runtime_handles().unwrap()[profile]
            .lock()
            .unwrap()
            .cdp
            .close();
        assert!(browsers.frame(&id).is_err());
        assert!(browsers.list().unwrap().iter().any(|page| page.id == id));
        automation::call(&control, json!({"kind":"reconnect","id":id})).unwrap();
        let value = browsers.action(&id,Action::Evaluate{expression:"({value:document.querySelector('input').value,clicks:window.clicks,origin:performance.timeOrigin,width:innerWidth,height:innerHeight})".into()}).unwrap();
        assert_eq!(value["value"], "unsent draft");
        assert_eq!(value["clicks"], 1);
        assert_eq!(value["origin"], origin);
        assert_eq!(value["width"], 700);
        assert_eq!(value["height"], 600);
        let frame = browsers
            .frame_since(&id, Some(previous_frame.version))
            .unwrap();
        assert!(frame.version > previous_frame.version);
        assert!(!frame.image.is_empty());
        assert_eq!(frame.info["url"], url);
        assert_ne!(frame.info["revision"], before["revision"]);
        assert!(browsers
            .action(
                &id,
                Action::FillRef {
                    reference,
                    value: "replayed".into()
                }
            )
            .is_err());
        let target = browsers.state.lock().unwrap().pages[&id].target.clone();
        if let Some(host_page) = &host_page {
            let foreign = host.state.lock().unwrap().pages[host_page].target.clone();
            browsers
                .state
                .lock()
                .unwrap()
                .pages
                .get_mut(&id)
                .unwrap()
                .target = foreign;
            assert!(browsers
                .reconnect(&id)
                .unwrap_err()
                .message
                .contains("PREVIEW_PAGE_GONE"));
            browsers
                .state
                .lock()
                .unwrap()
                .pages
                .get_mut(&id)
                .unwrap()
                .target = target.clone();
        }

        browsers.runtime_handles().unwrap()[profile]
            .lock()
            .unwrap()
            .cdp
            .call("Target.closeTarget", json!({"targetId":target}))
            .unwrap();
        assert!(browsers
            .reconnect(&id)
            .unwrap_err()
            .message
            .contains("PREVIEW_PAGE_GONE"));
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
