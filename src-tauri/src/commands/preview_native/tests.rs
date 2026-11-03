use super::*;
#[test]
fn refuses_local_privileged_urls_and_invalid_bounds() {
    for url in [
        "file:///private/data",
        "tauri://localhost",
        "javascript:alert(1)",
        "data:text/html,test",
    ] {
        assert!(native_url(url).is_err());
    }
    assert!(native_url("https://example.invalid/").is_ok());
    assert!(native_url("about:blank").is_ok());
    for width in [0.0, f64::NAN, 20001.0] {
        assert!(NativeBounds {
            x: 0.0,
            y: 0.0,
            width,
            height: 600.0
        }
        .validate()
        .is_err());
    }
}
