use super::*;
#[test]
fn refuses_local_file_and_script_navigation() {
    for url in [
        "file:///private/document.html",
        "javascript:alert(1)",
        "data:text/html,test",
        "about:config",
    ] {
        assert!(validate_url(url).is_err());
    }
    assert!(validate_url("http://localhost:3000/").is_ok());
    assert!(validate_url("https://example.invalid/").is_ok());
}

#[test]
#[ignore = "requires an installed Chromium runtime; uses an isolated temporary profile"]
fn navigates_types_resizes_and_captures_a_real_browser_page() {
    use base64::Engine;
    let directory = tempfile::tempdir().unwrap();
    let site = directory.path().join("site");
    std::fs::create_dir(&site).unwrap();
    std::fs::write(site.join("index.html"), "<!doctype html><title>Preview contract</title><h1>Real page</h1><input id='name'><button>Continue</button>").unwrap();
    let documents = std::sync::Arc::new(crate::core::preview::documents::Documents::default());
    let document = documents.open(&site.join("index.html")).unwrap();
    let assets = crate::core::preview::assets::Assets::start(documents).unwrap();
    let browsers = Browsers::new(directory.path().join("runtime"));
    let id = browsers
        .create_owned(
            "default",
            &assets.document_url(&document.id, &document.title),
            "gui-tab",
        )
        .unwrap();
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        if browsers
            .action(
                &id,
                Action::Evaluate {
                    expression: "document.querySelector('h1')?.textContent".into(),
                },
            )
            .unwrap()
            == "Real page"
        {
            break;
        }
        assert!(std::time::Instant::now() < deadline);
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    browsers
        .action(
            &id,
            Action::Evaluate {
                expression: "document.querySelector('input').focus()".into(),
            },
        )
        .unwrap();
    browsers
        .action(
            &id,
            Action::Text {
                text: "preview input".into(),
            },
        )
        .unwrap();
    assert_eq!(
        browsers
            .action(
                &id,
                Action::Evaluate {
                    expression: "document.querySelector('input').value".into()
                }
            )
            .unwrap(),
        "preview input"
    );
    browsers
        .action(
            &id,
            Action::Resize {
                width: 390,
                height: 844,
                mobile: false,
            },
        )
        .unwrap();
    assert_eq!(
        browsers
            .action(
                &id,
                Action::Evaluate {
                    expression: "innerWidth".into()
                }
            )
            .unwrap(),
        390
    );
    browsers
        .action(
            &id,
            Action::Evaluate {
                expression: "window.open(location.href + '?child=1'); true".into(),
            },
        )
        .unwrap();
    let pages = browsers.list().unwrap();
    assert_eq!(pages.len(), 2);
    assert_eq!(
        pages
            .iter()
            .find(|page| page.id == id)
            .unwrap()
            .owner
            .as_deref(),
        Some("gui-tab")
    );
    let position=browsers.action(&id,Action::Evaluate{expression:"(()=>{const r=document.querySelector('h1').getBoundingClientRect();return {x:r.x+10,y:r.y+r.height/2}})()".into()}).unwrap();
    browsers
        .action(
            &id,
            Action::Mouse {
                x: position["x"].as_f64().unwrap(),
                y: position["y"].as_f64().unwrap(),
                event: "mouseMoved".into(),
                button: Some("none".into()),
                delta_x: None,
                delta_y: None,
            },
        )
        .unwrap();
    assert_eq!(
        browsers
            .action(
                &id,
                Action::Evaluate {
                    expression: "document.querySelector('h1').matches(':hover')".into()
                }
            )
            .unwrap(),
        true
    );
    let frame = browsers.frame(&id).unwrap();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(frame.image)
        .unwrap();
    assert_eq!(
        image::load_from_memory_with_format(&bytes, image::ImageFormat::Jpeg)
            .unwrap()
            .width(),
        390
    );
    let picked = browsers
        .action(&id, Action::Pick { x: 20., y: 30. })
        .unwrap();
    assert!(!picked["selector"].as_str().unwrap().is_empty());
    assert_eq!(picked["title"], "Preview contract");
    assert!(picked["domPath"]
        .as_array()
        .is_some_and(|path| !path.is_empty()));
    assert!(picked["viewport"]["dpr"].as_f64().unwrap() > 0.);
    assert_eq!(picked["viewport"]["scrollY"], 0.);
    browsers.close(&id).unwrap();
    assert!(browsers.frame(&id).is_err());
    let id = pages.iter().find(|page| page.id != id).unwrap().id.clone();
    // A lost control connection must not erase the page or claim it was closed.
    let runtime = browsers.state.lock().unwrap().runtimes["default"].clone();
    runtime.lock().unwrap().cdp.close();
    assert!(browsers.close(&id).is_err());
    assert!(browsers.state.lock().unwrap().pages.contains_key(&id));
    browsers.clear();
}
