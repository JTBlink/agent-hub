use super::*;

#[test]
fn dev_bundle_keeps_product_identity_and_refreshes_the_executable() {
    let root = tempfile::tempdir().unwrap();
    let executable = root.path().join("agent-hub");
    let cli = root.path().join(app_lib::product::CLI_NAME);
    std::fs::copy("/usr/bin/true", &executable).unwrap();
    let original = std::fs::read(&executable).unwrap();
    std::fs::copy("/usr/bin/true", &cli).unwrap();
    let original_cli = std::fs::read(&cli).unwrap();
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
        std::fs::read(bundled.with_file_name(app_lib::product::CLI_NAME)).unwrap(),
        original_cli
    );
    assert!(contents.join("Resources/icon.icns").is_file());
    assert!(info["NSDownloadsFolderUsageDescription"]
        .as_string()
        .is_some());
    let verification = std::process::Command::new("/usr/bin/codesign")
        .args(["--verify", "--strict"])
        .arg(contents.parent().unwrap())
        .output()
        .unwrap();
    assert!(
        verification.status.success(),
        "{}",
        String::from_utf8_lossy(&verification.stderr)
    );
    assert_eq!(std::fs::read(&executable).unwrap(), original);
    assert_eq!(std::fs::read(&cli).unwrap(), original_cli);
    assert!(std::process::Command::new(&bundled)
        .status()
        .unwrap()
        .success());

    // Model Cargo replacing its output while the old bundle is still present.
    std::fs::remove_file(&executable).unwrap();
    std::fs::copy("/usr/bin/false", &executable).unwrap();
    prepare_bundle(&executable, &config).unwrap();
    assert!(!std::process::Command::new(&bundled)
        .status()
        .unwrap()
        .success());
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
