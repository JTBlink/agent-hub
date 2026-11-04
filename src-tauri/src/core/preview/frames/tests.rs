use super::*;
#[test]
#[ignore = "requires installed Chromium; compares metadata query cost and validates resize invalidation"]
fn cached_frames_avoid_control_requests_and_resize_invalidates_metadata() {
    use super::super::browser::Action;
    let directory = tempfile::tempdir().unwrap();
    let browsers = Browsers::new(directory.path().join("runtime"));
    let id = browsers.create("guest", "about:blank").unwrap();
    let full = browsers.frame(&id).unwrap();
    let start = Instant::now();
    for _ in 0..20 {
        browsers.frame(&id).unwrap();
    }
    let full_time = start.elapsed();
    let page = browsers.page(&id).unwrap();
    let before = page.lock().unwrap().cdp.request_count();
    let start = Instant::now();
    for _ in 0..20 {
        let cached = browsers.quick_frame(&id, Some(full.version)).unwrap();
        assert_eq!(cached.info["revision"], full.info["revision"]);
    }
    let cached_time = start.elapsed();
    assert_eq!(
        page.lock().unwrap().cdp.request_count(),
        before,
        "Cached frame reads must not issue metadata requests"
    );
    browsers
        .action(
            &id,
            Action::Resize {
                device_scale_factor: None,
                width: 800,
                height: 600,
                mobile: false,
            },
        )
        .unwrap();
    let resized = browsers.quick_frame(&id, None).unwrap();
    assert_eq!(resized.info["width"], 800);
    assert_eq!(resized.info["height"], 600);
    eprintln!("20 full frame reads: {full_time:?}; 20 cached frame reads: {cached_time:?}; cached metadata requests: 0");
    browsers.close(&id).unwrap();
}

#[test]
#[ignore = "requires installed Chromium; validates high density rendering in an isolated profile"]
fn high_density_frames_keep_logical_coordinates_and_double_pixel_resolution() {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let directory = tempfile::tempdir().unwrap();
    let browsers = Browsers::new(directory.path().join("runtime"));
    let id = browsers.create("guest", "about:blank").unwrap();
    browsers
        .action(
            &id,
            super::super::browser::Action::Resize {
                width: 800,
                height: 600,
                mobile: false,
                device_scale_factor: Some(2.),
            },
        )
        .unwrap();
    let frame = browsers.frame(&id).unwrap();
    assert_eq!(frame.info["width"], 800);
    assert_eq!(frame.info["height"], 600);
    assert_eq!(frame.info["dpr"], 2);
    browsers.action(&id, super::super::browser::Action::Evaluate {
        expression: "window.previewTimer=setInterval(()=>document.body.textContent=String(Date.now()),30);true".into(),
    }).unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut version = frame.version;
    loop {
        let next = browsers.frame_since(&id, Some(version)).unwrap();
        version = next.version;
        if !next.image.is_empty() && next.image_mime == "image/jpeg" {
            let bytes = STANDARD.decode(next.image).unwrap();
            let image =
                image::load_from_memory_with_format(&bytes, image::ImageFormat::Jpeg).unwrap();
            assert!([(800, 600), (1600, 1200)].contains(&(image.width(), image.height())));
            break;
        }
        assert!(
            Instant::now() < deadline,
            "Moving content must receive live JPEG frames"
        );
        std::thread::sleep(Duration::from_millis(30));
    }
    browsers
        .action(
            &id,
            super::super::browser::Action::Evaluate {
                expression: "clearInterval(window.previewTimer);true".into(),
            },
        )
        .unwrap();
    browsers
        .action(
            &id,
            super::super::browser::Action::Evaluate {
                expression: "document.body.innerHTML='<h1>Updated Retina content</h1>';true".into(),
            },
        )
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let next = browsers.frame_since(&id, Some(version)).unwrap();
        if !next.image.is_empty() && next.image_mime == "image/png" {
            let bytes = STANDARD.decode(next.image).unwrap();
            let image =
                image::load_from_memory_with_format(&bytes, image::ImageFormat::Png).unwrap();
            assert_eq!((image.width(), image.height()), (1600, 1200));
            std::thread::sleep(Duration::from_millis(800));
            let unchanged = browsers.frame_since(&id, Some(next.version)).unwrap();
            assert!(
                unchanged.image.is_empty(),
                "Settled content must not be captured repeatedly"
            );
            break;
        }
        assert!(
            Instant::now() < deadline,
            "Retina stream must continue after the first screenshot"
        );
        std::thread::sleep(Duration::from_millis(30));
    }
    browsers.close(&id).unwrap();
}
