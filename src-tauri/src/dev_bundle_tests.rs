use super::*;

#[test]
fn dev_bundle_keeps_product_identity_and_refreshes_the_executable() {
    let root = tempfile::tempdir().unwrap();
    let executable = root.path().join("agent-hub");
    let cli = root.path().join("agent-hub-cli");
    std::fs::write(&executable, "first build").unwrap();
    std::fs::write(&cli, "companion cli").unwrap();
    let config = tauri::Config {
        product_name: Some("Example App".into()),
        identifier: "invalid.example.app".into(),
        ..Default::default()
    };
    let bundled = prepare_bundle(&executable, &config).unwrap().unwrap();
    let contents = bundled.parent().unwrap().parent().unwrap();
    let info = plist::Value::from_file(contents.join("Info.plist")).unwrap();
    let info = info.as_dictionary().unwrap();
    assert_eq!(info["CFBundleDisplayName"].as_string(), Some("Example App"));
    assert_eq!(
        info["CFBundleIdentifier"].as_string(),
        Some("invalid.example.app")
    );
    assert_eq!(
        std::fs::read(bundled.with_file_name("agent-hub-cli")).unwrap(),
        b"companion cli"
    );
    assert!(contents.join("Resources/icon.icns").is_file());

    // Model Cargo replacing its output while the old bundle is still present.
    std::fs::remove_file(&executable).unwrap();
    std::fs::write(&executable, "second build").unwrap();
    prepare_bundle(&executable, &config).unwrap();
    assert_eq!(std::fs::read(bundled).unwrap(), b"second build");
}

#[test]
fn bundled_binary_does_not_relaunch_again() {
    assert_eq!(
        bundle_executable(
            Path::new("target/debug/bundle/macos/AgentHub.app/Contents/MacOS/agent-hub"),
            "AgentHub"
        ),
        None
    );
}
