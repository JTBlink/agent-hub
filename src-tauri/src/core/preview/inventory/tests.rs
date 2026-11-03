use super::*;
use crate::core::preview::{browser::Action, runtime::BrowserProfile};
#[test]
#[ignore = "requires installed Chromium; deterministic stale observation ordering across page/context replacement"]
fn stale_inventory_does_not_remove_or_downgrade_a_reopened_logical_page() {
    for remote in [false, true] {
        let root = tempfile::tempdir().unwrap();
        let host = Browsers::new(root.path().join("host"));
        if remote {
            host.create("default", "about:blank").unwrap();
        }
        let browsers = Browsers::new(root.path().join("client"));
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
        let id = browsers
            .create_owned(profile, "about:blank", "gui-tab")
            .unwrap();
        browsers
            .action(
                &id,
                Action::Evaluate {
                    expression: "document.title='Old document';true".into(),
                },
            )
            .unwrap();
        if remote {
            let runtime = browsers.runtime_handles().unwrap()[profile].clone();
            let mut runtime = runtime.lock().unwrap();
            let context = runtime.context.clone().unwrap();
            runtime
                .cdp
                .call(
                    "Target.disposeBrowserContext",
                    json!({"browserContextId":context}),
                )
                .unwrap();
        }
        let observed = browsers.observe_inventory().unwrap();
        browsers.reopen(&id).unwrap();
        let frame = browsers.frame(&id).unwrap();
        let current = browsers.page(&id).unwrap();
        let target = browsers.state.lock().unwrap().pages[&id].target.clone();
        let pages = browsers.apply_inventory(observed).unwrap();
        assert_eq!(pages.len(), 1);
        assert_eq!(pages[0].id, id);
        assert_eq!(pages[0].status, PageStatus::Connected);
        assert_eq!(pages[0].title, frame.info["title"].as_str().unwrap());
        assert!(Arc::ptr_eq(&current, &browsers.page(&id).unwrap()));
        assert_eq!(browsers.state.lock().unwrap().pages[&id].target, target);
        browsers.clear();
        host.clear();
    }
}
