use super::*;
use crate::core::preview::{automation, browser, cookies, packets};
use serde_json::json;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

fn preview(root: &std::path::Path) -> Arc<Preview> {
    let browsers = Arc::new(browser::Browsers::new(root.join("browser")));
    Arc::new(Preview {
        external_opens: ExternalOpens::default(),
        documents: browsers.documents.clone(),
        browsers,
        automation: Mutex::new(None),
        packets: packets::Packets::new(root.join("deliveries")),
        cookie_imports: cookies::Imports::shared(),
        assets: Mutex::new(None),
        closed: AtomicBool::new(false),
    })
}

#[test]
fn authenticated_file_requests_survive_ui_startup_and_coalesce_pending_duplicates() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("a guide.md");
    std::fs::write(&path, "# Guide").unwrap();
    let preview = preview(root.path());
    let server = automation::Automation::start_for_preview(&preview).unwrap();
    let endpoint: automation::ControlEndpoint =
        serde_json::from_slice(&std::fs::read(root.path().join("browser/control.json")).unwrap())
            .unwrap();
    let body = json!({"kind":"open_file","path":path});
    let wrong = automation::ControlEndpoint {
        url: endpoint.url.clone(),
        token: "incorrect".into(),
    };
    assert!(automation::call(&wrong, body.clone()).is_err());
    assert!(preview.take_external_documents().unwrap().is_empty());
    let first = automation::call(&endpoint, body.clone()).unwrap();
    let second = automation::call(&endpoint, body).unwrap();
    assert_eq!(first["id"], second["id"]);
    assert_eq!(first["status"], "requested");
    assert!(first.get("content").is_none());
    let documents = preview.take_external_documents().unwrap();
    assert_eq!(documents.len(), 1);
    assert_eq!(documents[0].document.content, "# Guide");
    assert!(preview.take_external_documents().unwrap().is_empty());
    preview.documents.close(&documents[0].document.id);
    drop(server);
    preview.clear();
}

#[test]
fn queue_overflow_does_not_leak_document_grants() {
    let root = tempfile::tempdir().unwrap();
    let preview = preview(root.path());
    for index in 0..13 {
        std::fs::write(root.path().join(format!("{index}.md")), "text").unwrap();
    }
    for index in 0..12 {
        preview
            .queue_external_document(root.path().join(format!("{index}.md")).to_str().unwrap())
            .unwrap();
    }
    for _ in 0..110 {
        let error = preview
            .queue_external_document(root.path().join("12.md").to_str().unwrap())
            .unwrap_err();
        assert!(error.to_string().contains("pending documents"));
    }
    for document in preview.take_external_documents().unwrap() {
        preview.documents.close(&document.document.id);
    }
    assert!(preview
        .queue_external_document(root.path().join("12.md").to_str().unwrap())
        .is_ok());
    preview.clear();
}

#[test]
fn shutdown_revokes_pending_grants_and_releases_the_desktop_signal() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("guide.md");
    std::fs::write(&path, "text").unwrap();
    let preview = preview(root.path());
    let signal = Arc::new(AtomicUsize::new(0));
    let counter = signal.clone();
    preview.set_external_open_signal(move || {
        counter.fetch_add(1, Ordering::Relaxed);
    });
    let receipt = preview
        .queue_external_document(path.to_str().unwrap())
        .unwrap();
    assert_eq!(signal.load(Ordering::Relaxed), 1);
    preview.clear();
    assert!(preview.documents.read(&receipt.id).is_err());
    assert!(preview
        .queue_external_document(path.to_str().unwrap())
        .is_err());
    assert_eq!(Arc::strong_count(&signal), 1);
}
