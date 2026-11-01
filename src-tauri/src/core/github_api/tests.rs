use super::*;

#[test]
fn device_flow_and_frontend_settings_use_the_same_oauth_app() {
    let frontend = include_str!("../../../../src/lib/distribution.ts");
    assert!(frontend.contains(&format!(
        "export const GITHUB_OAUTH_CLIENT_ID = \"{OAUTH_CLIENT_ID}\";"
    )));
}

#[test]
fn repo_name_validation() {
    assert!(is_valid_repo_name("agent-hub-backup"));
    assert!(is_valid_repo_name("My_Backup.2026"));
    assert!(!is_valid_repo_name(""));
    assert!(!is_valid_repo_name("."));
    assert!(!is_valid_repo_name(".."));
    assert!(!is_valid_repo_name("has space"));
    assert!(!is_valid_repo_name("has/slash"));
    assert!(!is_valid_repo_name(&"x".repeat(101)));
}
