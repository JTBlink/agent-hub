use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};
#[test]
#[ignore = "requires installed Chromium; verifies document viewport clipping and full capture"]
fn rendered_document_capture_preserves_the_requested_region() {
    let root = tempfile::tempdir().unwrap();
    let preview = Preview {
        browsers: Arc::new(browser::Browsers::new(root.path().join("browser"))),
        automation: Mutex::new(None),
        documents: Arc::new(documents::Documents::default()),
        packets: packets::Packets::new(root.path().join("deliveries")),
        assets: Mutex::new(None),
        cookie_imports: cookies::Imports::shared(),
        closed: AtomicBool::new(false),
    };
    let html="<!doctype html><style>html,body{margin:0}div{height:400px;background:red}div+div{background:blue}</style><div></div><div></div>";
    let data = preview
        .capture_rendered(
            html,
            500,
            300,
            "default",
            false,
            Some(serde_json::json!({"x":0,"y":450,"width":500,"height":200})),
        )
        .unwrap();
    let bytes = STANDARD.decode(data).unwrap();
    let image = image::load_from_memory_with_format(&bytes, image::ImageFormat::Png)
        .unwrap()
        .to_rgb8();
    assert_eq!(image.dimensions(), (500, 200));
    assert_eq!(image.get_pixel(250, 100).0, [0, 0, 255]);
    let data = preview
        .capture_rendered(html, 500, 300, "default", true, None)
        .unwrap();
    let bytes = STANDARD.decode(data).unwrap();
    let image = image::load_from_memory_with_format(&bytes, image::ImageFormat::Png).unwrap();
    assert_eq!(image.height(), 800);
    preview.clear();
}

#[test]
fn file_links_reuse_the_source_grant_and_preserve_query_and_fragment_for_both_destinations() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("guide.md");
    std::fs::write(&path, "# Guide").unwrap();
    std::fs::write(root.path().join("next.md"), "# Target").unwrap();
    std::fs::write(root.path().join("page.html"), "<title>Page</title>").unwrap();
    let preview = Preview {
        browsers: Arc::new(browser::Browsers::new(root.path().join("browser"))),
        automation: Mutex::new(None),
        documents: Arc::new(documents::Documents::default()),
        packets: packets::Packets::new(root.path().join("deliveries")),
        assets: Mutex::new(None),
        cookie_imports: cookies::Imports::shared(),
        closed: AtomicBool::new(false),
    };
    let document = preview.open_document(&path).unwrap();
    for _ in 0..150 {
        let url = reqwest::Url::parse(
            &preview
                .resource_link(&document.document.id, "page.html?mode=read#target")
                .unwrap(),
        )
        .unwrap();
        assert!(url.host_str().unwrap().starts_with(&document.document.id));
        assert_eq!(url.query(), Some("mode=read"));
        assert_eq!(url.fragment(), Some("target"));
    }
    let LinkedResource::Document { document: linked } = preview
        .open_link(&document.document.id, "next.md?mode=read#target")
        .unwrap()
    else {
        panic!("expected Markdown document")
    };
    assert!(linked.url.ends_with("next.md?mode=read#target"));
    preview.documents.close(&document.document.id);
    assert!(preview
        .resource_link(&document.document.id, "page.html")
        .is_err());
    assert_eq!(
        preview.documents.read(&linked.document.id).unwrap().content,
        "# Target"
    );
    preview.clear();
}

#[test]
#[ignore = "requires installed Chromium; opens a granted file URL with encoded path, root resources, query and fragment"]
fn browser_follows_granted_file_links_with_encoded_paths_and_url_suffixes() {
    use std::time::{Duration, Instant};
    let root = tempfile::tempdir().unwrap();
    let folder = root.path().join("literal%20folder");
    std::fs::create_dir(&folder).unwrap();
    std::fs::write(folder.join("guide.md"), "# Guide").unwrap();
    std::fs::write(folder.join("page #.html"), "<!doctype html><link rel='stylesheet' href='/style.css'><title>Linked page</title><p id='target'>Target</p>").unwrap();
    std::fs::write(root.path().join("style.css"), "p{color:rgb(1,2,3)}").unwrap();
    let preview = Preview {
        browsers: Arc::new(browser::Browsers::new(root.path().join("browser"))),
        automation: Mutex::new(None),
        documents: Arc::new(documents::Documents::default()),
        packets: packets::Packets::new(root.path().join("deliveries")),
        assets: Mutex::new(None),
        cookie_imports: cookies::Imports::shared(),
        closed: AtomicBool::new(false),
    };
    let source = preview
        .open_at(root.path(), "literal%20folder/guide.md")
        .unwrap();
    let url = preview
        .resource_link(&source.document.id, "page%20%23.html?mode=read#target")
        .unwrap();
    let id = preview.browsers.create("default", &url).unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let value = preview.browsers.action(&id, browser::Action::Evaluate { expression: "JSON.stringify({title:document.title,search:location.search,hash:location.hash,color:document.querySelector('p')?getComputedStyle(document.querySelector('p')).color:''})".into() });
        if let Ok(value) = value {
            if let Some(value) = value
                .as_str()
                .and_then(|value| serde_json::from_str::<serde_json::Value>(value).ok())
            {
                if value["title"] == "Linked page" && value["color"] == "rgb(1, 2, 3)" {
                    assert_eq!(value["search"], "?mode=read");
                    assert_eq!(value["hash"], "#target");
                    break;
                }
            }
        }
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(30));
    }
    preview.clear();
}
