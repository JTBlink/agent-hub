#![cfg(feature = "sdk-cli")]

use agent_hub_core::{RELEASE_LOCK_JSON, VERSION};
use std::process::Command;

#[test]
fn installed_command_reports_the_same_lock_and_sdk_version_as_the_library() {
    let cli = env!("CARGO_BIN_EXE_agent-hub-core");
    let lock = Command::new(cli).arg("lock").output().unwrap();
    assert!(lock.status.success());
    assert_eq!(lock.stdout, RELEASE_LOCK_JSON.as_bytes());
    assert!(RELEASE_LOCK_JSON.contains(&format!("\"version\": \"{VERSION}\"")));
    let source: serde_json::Value = serde_json::from_str(RELEASE_LOCK_JSON).unwrap();
    assert!(source["repository"]
        .as_str()
        .unwrap()
        .starts_with("https://"));
    assert_eq!(source["revision"].as_str().unwrap().len(), 40);
    let version = Command::new(cli).arg("--version").output().unwrap();
    assert!(version.status.success());
    assert_eq!(
        version.stdout,
        format!("agent-hub-core {VERSION}\n").as_bytes()
    );
}
