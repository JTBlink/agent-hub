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
            height: 600.0,
            zoom: None
        }
        .validate()
        .is_err());
    }
}

#[test]
fn filters_malformed_page_events_before_the_inspector_receives_them() {
    let value = serde_json::json!([{"method":{"invalid":true},"params":{}},{"method":"Runtime.consoleAPICalled","params":{"type":"log"}},{"method":"Runtime.exceptionThrown","params":null}]);
    let events = control::inspection_events(&value);
    assert_eq!(events.len(), 1);
    assert_eq!(events[0]["method"], "Runtime.consoleAPICalled");
}
