use super::*;
#[test]
fn missing_page_does_not_create_or_overwrite_an_export() {
    let root = tempfile::tempdir().unwrap();
    let browsers = Browsers::new(root.path().join("browser"));
    let path = root.path().join("feedback.md");
    let expected = ExpectedPage {
        id: "missing-page".into(),
        revision: "old".into(),
    };
    assert!(write(&browsers, &path, b"stale", Some(&expected)).is_err());
    assert!(!path.exists());
    std::fs::write(&path, "existing").unwrap();
    assert!(write(&browsers, &path, b"stale", Some(&expected)).is_err());
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "existing");
    write(&browsers, &path, b"document export", None).unwrap();
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "document export");
}
#[test]
#[ignore = "requires installed Chromium; verifies native export rejection after soft navigation or disconnect"]
fn verifies_export_identity_after_the_save_dialog_delay() {
    use crate::core::preview::{assets::Assets, browser::Action, documents::Documents};
    use serde_json::json;
    use std::{
        sync::Arc,
        time::{Duration, Instant},
    };
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("index.html");
    std::fs::write(
        &source,
        "<!doctype html><title>Export</title><p>Context</p>",
    )
    .unwrap();
    let docs = Arc::new(Documents::default());
    let document = docs.open(&source).unwrap();
    let assets = Assets::start(docs).unwrap();
    let browsers = Browsers::new(root.path().join("browser"));
    let id = browsers
        .create(
            "default",
            &assets.browser_document_url(&document.id, &document.title),
        )
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    let revision = loop {
        let page = browsers.page(&id).unwrap();
        if let Ok((revision, url)) = page.lock().unwrap().identity() {
            if url.ends_with("index.html") {
                break revision;
            }
        }
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(30));
    };
    let path = root.path().join("feedback.md");
    let expected = ExpectedPage {
        id: id.clone(),
        revision,
    };
    write(&browsers, &path, b"current", Some(&expected)).unwrap();
    browsers
        .action(
            &id,
            Action::Evaluate {
                expression: "history.pushState({},'', '#next')".into(),
            },
        )
        .unwrap();
    assert!(write(&browsers, &path, b"stale", Some(&expected)).is_err());
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "current");
    let page = browsers.page(&id).unwrap();
    let current = ExpectedPage {
        id: id.clone(),
        revision: page.lock().unwrap().identity().unwrap().0,
    };
    browsers
        .action(
            &id,
            Action::Evaluate {
                expression: "document.title".into(),
            },
        )
        .unwrap();
    page.lock()
        .unwrap()
        .cdp
        .call("Page.close", json!({}))
        .unwrap();
    assert!(write(&browsers, &path, b"disconnected", Some(&current)).is_err());
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "current");
    browsers.clear();
}
