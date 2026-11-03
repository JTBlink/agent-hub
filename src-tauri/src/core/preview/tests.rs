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
