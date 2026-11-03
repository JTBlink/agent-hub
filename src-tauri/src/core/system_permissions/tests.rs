use super::*;
#[test]
fn settings_destinations_are_allowlisted_and_support_old_and_new_macos() {
    assert_eq!(macos_settings_url(Permission::Accessibility, 13), "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Accessibility");
    assert_eq!(
        macos_settings_url(Permission::ScreenCapture, 12),
        "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
    );
    assert!(macos_settings_url(Permission::FilesFolders, 15).ends_with("?Privacy_FilesAndFolders"));
    assert!(macos_settings_url(Permission::FullDisk, 15).ends_with("?Privacy_AllFiles"));
    assert!(serde_json::from_str::<Permission>("\"arbitrary-url\"").is_err());
}
