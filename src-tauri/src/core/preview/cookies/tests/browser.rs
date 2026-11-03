use super::*;
use crate::core::preview::{assets::Assets, browser::Action, documents::Documents};
use serde_json::json;
#[test]
#[ignore = "requires installed Chromium; isolated browsers validate import scope, source preservation and navigation rejection"]
fn previews_browser_login_without_exposing_values_and_imports_only_selected_domains() {
    let root = tempfile::tempdir().unwrap();
    let site = root.path().join("index.html");
    std::fs::write(&site, "<!doctype html><title>Cookie import test</title>").unwrap();
    let docs = Arc::new(Documents::default());
    let doc = docs.open(&site).unwrap();
    let assets = Assets::start(docs).unwrap();
    let url = assets.browser_document_url(&doc.id, &doc.title);
    let browsers = Browsers::new(root.path().join("runtime"));
    let target_id = browsers.create("default", &url).unwrap();
    let source_id = browsers.create("guest", &url).unwrap();
    let ready = |id: &str| {
        let until = Instant::now() + Duration::from_secs(5);
        loop {
            let frame = browsers.frame(id).unwrap();
            if frame.info["url"] == url && frame.info["ready"] == "complete" {
                break frame.info["revision"].as_str().unwrap().to_owned();
            }
            assert!(Instant::now() < until);
            std::thread::sleep(Duration::from_millis(20));
        }
    };
    let revision = ready(&target_id);
    ready(&source_id);
    let cookie = |domain: &str, name: &str, value: &str| json!({"domain":domain,"name":name,"value":value,"path":"/"});
    browsers
        .action(
            &source_id,
            Action::ImportCookies {
                cookies: json!([
                    cookie(".example.invalid", "session", "source-secret-marker"),
                    cookie(".unselected.invalid", "source-only", "keep")
                ]),
            },
        )
        .unwrap();
    browsers
        .action(
            &target_id,
            Action::ImportCookies {
                cookies: json!([
                    cookie(".example.invalid", "old-only", "old"),
                    cookie(".other.invalid", "unrelated", "keep")
                ]),
            },
        )
        .unwrap();
    let endpoint = browsers.runtime_handles().unwrap()["guest"]
        .lock()
        .unwrap()
        .endpoint
        .clone();
    let imports = Imports::default();
    let source_before = sources::browser(&endpoint).unwrap();
    let summary = imports
        .prepare(&browsers, &target_id, &revision, source_before.clone())
        .unwrap();
    assert_eq!(summary.importable, 2);
    assert!(!serde_json::to_string(&summary)
        .unwrap()
        .contains("source-secret-marker"));
    let before = browsers.action(&target_id, Action::Cookies).unwrap();
    assert!(!before["cookies"]
        .as_array()
        .unwrap()
        .iter()
        .any(|cookie| cookie["name"] == "session"));
    let result = imports
        .apply(&browsers, &summary.id, vec!["example.invalid".into()], true)
        .unwrap();
    assert_eq!(result.imported, 1);
    assert_eq!(result.removed, 1);
    let after = browsers.action(&target_id, Action::Cookies).unwrap();
    let cookies = after["cookies"].as_array().unwrap();
    assert!(cookies.iter().any(|cookie| cookie["name"] == "unrelated"));
    assert!(cookies
        .iter()
        .any(|cookie| cookie["name"] == "session" && cookie["value"] == "source-secret-marker"));
    assert!(!cookies
        .iter()
        .any(|cookie| cookie["name"] == "old-only" || cookie["name"] == "source-only"));
    assert!(imports
        .apply(&browsers, &summary.id, vec!["example.invalid".into()], true)
        .is_err());
    assert_eq!(
        sources::browser(&endpoint)
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(browsers.list().unwrap().len(), 2);
    let stale = imports
        .prepare(
            &browsers,
            &target_id,
            &revision,
            json!([cookie(".example.invalid", "late", "not-applied")]),
        )
        .unwrap();
    browsers
        .action(&target_id, Action::Reload { hard: false })
        .unwrap();
    let until = Instant::now() + Duration::from_secs(5);
    while ready(&target_id) == revision {
        assert!(Instant::now() < until);
        std::thread::sleep(Duration::from_millis(20));
    }
    assert!(imports
        .apply(&browsers, &stale.id, vec!["example.invalid".into()], false)
        .is_err());
    let after = browsers.action(&target_id, Action::Cookies).unwrap();
    assert!(!after["cookies"]
        .as_array()
        .unwrap()
        .iter()
        .any(|cookie| cookie["name"] == "late"));
    // A rejected write restores removed originals before attempting cleanup of new coordinates.
    let revision = ready(&target_id);
    let failure = imports
        .prepare(
            &browsers,
            &target_id,
            &revision,
            json!([
                cookie(".example.invalid", "new", "temporary"),
                cookie(".example.invalid", "rejected", "invalid")
            ]),
        )
        .unwrap();
    imports
        .batches
        .lock()
        .unwrap()
        .get_mut(&failure.id)
        .unwrap()
        .cookies[1]
        .name = "bad\nname".into();
    assert!(imports
        .apply(&browsers, &failure.id, vec!["example.invalid".into()], true)
        .is_err());
    let after = browsers.action(&target_id, Action::Cookies).unwrap();
    assert!(after["cookies"]
        .as_array()
        .unwrap()
        .iter()
        .any(|cookie| cookie["name"] == "session" && cookie["value"] == "source-secret-marker"));
    assert!(!after["cookies"]
        .as_array()
        .unwrap()
        .iter()
        .any(|cookie| cookie["name"] == "new"));

    let page = browsers.page(&target_id).unwrap();
    let result=page.lock().unwrap().cdp.call("Network.setCookie",json!({"name":"partition-only","value":"bound","domain":".example.invalid","path":"/","secure":true,"partitionKey":{"topLevelSite":"https://top.invalid","hasCrossSiteAncestor":true}})).unwrap();
    assert_eq!(result["success"], true);
    let revision = ready(&target_id);
    let partitioned = imports
        .prepare(
            &browsers,
            &target_id,
            &revision,
            json!([cookie(".example.invalid", "merged", "new")]),
        )
        .unwrap();
    assert!(imports
        .apply(
            &browsers,
            &partitioned.id,
            vec!["example.invalid".into()],
            true
        )
        .is_err());
    let merged = imports
        .prepare(
            &browsers,
            &target_id,
            &revision,
            json!([cookie(".example.invalid", "merged", "new")]),
        )
        .unwrap();
    imports
        .apply(&browsers, &merged.id, vec!["example.invalid".into()], false)
        .unwrap();
    let current = browsers.action(&target_id, Action::Cookies).unwrap();
    assert!(current["cookies"]
        .as_array()
        .unwrap()
        .iter()
        .any(|cookie| cookie["name"] == "partition-only"));
    let canceled = imports
        .prepare(
            &browsers,
            &target_id,
            &revision,
            json!([cookie(".example.invalid", "canceled", "no")]),
        )
        .unwrap();
    imports.cancel(&canceled.id);
    assert!(imports
        .apply(
            &browsers,
            &canceled.id,
            vec!["example.invalid".into()],
            false
        )
        .is_err());
    let expired = imports
        .prepare(
            &browsers,
            &target_id,
            &revision,
            json!([cookie(".example.invalid", "expired-preview", "no")]),
        )
        .unwrap();
    imports
        .batches
        .lock()
        .unwrap()
        .get_mut(&expired.id)
        .unwrap()
        .created = Instant::now() - Duration::from_secs(301);
    assert!(imports
        .apply(
            &browsers,
            &expired.id,
            vec!["example.invalid".into()],
            false
        )
        .is_err());

    let host = reqwest::Url::parse(&url)
        .unwrap()
        .host_str()
        .unwrap()
        .to_owned();
    browsers.action(&source_id,Action::ImportCookies{cookies:json!([{"domain":host,"name":"import-auth","value":"synthetic-auth-token","httpOnly":true}])}).unwrap();
    let auth = imports
        .prepare(
            &browsers,
            &target_id,
            &revision,
            sources::browser(&endpoint).unwrap(),
        )
        .unwrap();
    imports
        .apply(&browsers, &auth.id, vec![host], false)
        .unwrap();
    page.lock().unwrap().cdp.events.clear();
    browsers
        .action(
            &target_id,
            Action::Evaluate {
                expression: "fetch(location.href+'?auth=1').then(()=>true)".into(),
            },
        )
        .unwrap();
    let frame = browsers.frame(&target_id).unwrap();
    assert!(frame
        .events
        .iter()
        .filter(|event| event["method"] == "Network.requestWillBeSentExtraInfo")
        .any(|event| event["params"]["headers"]["Cookie"]
            .as_str()
            .or_else(|| event["params"]["headers"]["cookie"].as_str())
            .is_some_and(|header| header.contains("import-auth=synthetic-auth-token"))));

    let soft = imports
        .prepare(
            &browsers,
            &target_id,
            &revision,
            json!([cookie(".example.invalid", "soft-stale", "no")]),
        )
        .unwrap();
    browsers
        .action(
            &target_id,
            Action::Evaluate {
                expression: "history.pushState({},'',location.pathname+'#other-route');true".into(),
            },
        )
        .unwrap();
    let frame = browsers.frame(&target_id).unwrap();
    assert_eq!(frame.info["url"], format!("{url}#other-route"));
    assert!(imports
        .apply(&browsers, &soft.id, vec!["example.invalid".into()], false)
        .is_err());
    browsers.clear();
}
