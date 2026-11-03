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
