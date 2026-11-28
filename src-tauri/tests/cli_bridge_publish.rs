//! Exercise the build-only publication command without touching the user's bridge.
use std::process::Command;

#[test]
fn publishes_the_built_cli_to_an_explicit_bridge_and_verifies_it_before_stamping() {
    let temporary = tempfile::tempdir().unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_agent-hub-cli"))
        .env("AGENT_HUB_BRIDGE_DIR", temporary.path())
        .args(["--json", "publish-cli-bridge"])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let report: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(report["ok"], true);
    let binary = std::path::Path::new(report["path"].as_str().unwrap());
    assert_eq!(binary.parent(), Some(temporary.path()));
    assert_eq!(
        binary.file_name().unwrap(),
        format!(
            "{}{}",
            app_lib::product::CLI_NAME,
            std::env::consts::EXE_SUFFIX
        )
        .as_str()
    );
    assert_eq!(
        std::fs::read_to_string(temporary.path().join(".version"))
            .unwrap()
            .trim(),
        app_lib::product::VERSION
    );
    let version = Command::new(binary).arg("--version").output().unwrap();
    assert!(version.status.success());
    assert_eq!(
        String::from_utf8(version.stdout).unwrap().trim(),
        format!(
            "{} {}",
            app_lib::product::CLI_NAME,
            app_lib::product::VERSION
        )
    );
}
