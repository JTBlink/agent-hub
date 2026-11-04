use super::Action;

#[test]
fn theme_requests_keep_legacy_resolved_colors_and_accept_system_mode() {
    for (request, expected) in [
        (r#"{"kind":"set_theme","dark":true}"#, false),
        (r#"{"kind":"set_theme","dark":true,"system":true}"#, true),
    ] {
        let action: Action = serde_json::from_str(request).unwrap();
        assert!(matches!(action, Action::SetTheme { dark: true, system } if system == expected));
    }
}
