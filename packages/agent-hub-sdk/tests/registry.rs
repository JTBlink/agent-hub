use agent_hub_sdk::{RELEASE_LOCK_JSON, VERSION};
use std::process::Command;

#[test]
fn installed_command_reports_the_same_lock_and_sdk_version_as_the_library() {
    let cli = env!("CARGO_BIN_EXE_agent-hub-sdk");
    let lock = Command::new(cli).arg("lock").output().unwrap();
    assert!(lock.status.success());
    assert_eq!(lock.stdout, RELEASE_LOCK_JSON.as_bytes());
    assert!(RELEASE_LOCK_JSON.contains(&format!("\"version\": \"{VERSION}\"")));
    assert!(RELEASE_LOCK_JSON.contains(&format!("/sdk-v{VERSION}/agent-hub-sdk-{VERSION}.tar.gz")));
    let version = Command::new(cli).arg("--version").output().unwrap();
    assert!(version.status.success());
    assert_eq!(
        version.stdout,
        format!("agent-hub-sdk {VERSION}\n").as_bytes()
    );
}
