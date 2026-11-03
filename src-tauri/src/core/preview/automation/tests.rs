use super::*;
#[test]
fn authenticates_controller_requests_and_removes_only_its_connection_file() {
    let root = tempfile::tempdir().unwrap();
    let browsers = Arc::new(Browsers::new(root.path().into()));
    let server = Automation::start(browsers.clone()).unwrap();
    let path = root.path().join("control.json");
    let endpoint: ControlEndpoint = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    let wrong = ControlEndpoint {
        url: endpoint.url.clone(),
        token: "incorrect".into(),
    };
    assert!(call(&wrong, json!({"kind":"list"})).is_err());
    assert_eq!(call(&endpoint, json!({"kind":"list"})).unwrap(), json!([]));
    drop(server);
    assert!(!path.exists());
    browsers.clear();
}
#[test]
#[ignore = "requires installed Chromium; runs against an isolated browser and authenticated CLI transport"]
fn shared_agent_transport_navigates_fills_and_captures_the_same_page() {
    use base64::Engine;
    let root = tempfile::tempdir().unwrap();
    let site = root.path().join("site");
    std::fs::create_dir(&site).unwrap();
    std::fs::write(site.join("index.html"),"<!doctype html><meta name='viewport' content='width=device-width'><title>CLI contract</title><input id='field'><button id='button' onclick='this.textContent=\"Done\"'>Continue</button>").unwrap();
    let documents = Arc::new(crate::core::preview::documents::Documents::default());
    let document = documents.open(&site.join("index.html")).unwrap();
    let assets = crate::core::preview::assets::Assets::start(documents).unwrap();
    let browsers = Arc::new(Browsers::new(root.path().join("runtime")));
    let server = Automation::start(browsers.clone()).unwrap();
    let endpoint: ControlEndpoint =
        serde_json::from_slice(&std::fs::read(root.path().join("runtime/control.json")).unwrap())
            .unwrap();
    let id=call(&endpoint,json!({"kind":"open","profile":"default","url":assets.browser_document_url(&document.id,&document.title)})).unwrap();
    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    let snapshot = loop {
        let value = call(
            &endpoint,
            json!({"kind":"action","id":id,"action":{"kind":"snapshot"}}),
        )
        .unwrap();
        if value["elements"]
            .as_array()
            .is_some_and(|items| items.len() >= 2)
        {
            break value;
        }
        assert!(std::time::Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(50));
    };
    let elements = snapshot["elements"].as_array().unwrap();
    let input = &elements.iter().find(|item| item["tag"] == "input").unwrap()["ref"];
    call(&endpoint,json!({"kind":"action","id":id,"action":{"kind":"fill_ref","reference":input,"value":"CLI text"}})).unwrap();
    assert_eq!(
        browsers
            .action(
                id.as_str().unwrap(),
                Action::Evaluate {
                    expression: "document.querySelector('input').value".into()
                }
            )
            .unwrap(),
        "CLI text"
    );
    let button = &elements
        .iter()
        .find(|item| item["tag"] == "button")
        .unwrap()["ref"];
    call(
        &endpoint,
        json!({"kind":"action","id":id,"action":{"kind":"click_ref","reference":button}}),
    )
    .unwrap();
    assert_eq!(
        browsers
            .action(
                id.as_str().unwrap(),
                Action::Evaluate {
                    expression: "document.querySelector('button').textContent".into()
                }
            )
            .unwrap(),
        "Done"
    );
    let image = call(
        &endpoint,
        json!({"kind":"action","id":id,"action":{"kind":"screenshot","full":true}}),
    )
    .unwrap();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(image["data"].as_str().unwrap())
        .unwrap();
    assert!(image::load_from_memory_with_format(&bytes, image::ImageFormat::Png).is_ok());
    call(&endpoint, json!({"kind":"close","id":id})).unwrap();
    assert!(call(&endpoint, json!({"kind":"list"}))
        .unwrap()
        .as_array()
        .unwrap()
        .is_empty());
    browsers.clear();
    drop(server);
}
