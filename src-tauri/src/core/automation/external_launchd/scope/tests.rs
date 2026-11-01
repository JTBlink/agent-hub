use super::*;
#[test]
fn keeps_user_agents_and_system_jobs_in_their_own_domains() {
    let home = Path::new("/workspace/home");
    let user = Scope::resolve(&home.join("Library/LaunchAgents/audit.plist"), home, 501).unwrap();
    assert_eq!(user.domain, "gui/501");
    assert!(!user.requires_admin);
    let daemon =
        Scope::resolve(Path::new("/Library/LaunchDaemons/audit.plist"), home, 501).unwrap();
    assert_eq!(daemon.domain, "system");
    assert_eq!(daemon.owner, 0);
    assert!(daemon.requires_admin);
    let agent = Scope::resolve(Path::new("/Library/LaunchAgents/audit.plist"), home, 501).unwrap();
    assert_eq!(agent.domain, "gui/501");
    assert!(agent.requires_admin);
    for path in [
        "/System/Library/LaunchDaemons/audit.plist",
        "/Library/LaunchDaemons/nested/audit.plist",
        "/tmp/audit.plist",
    ] {
        assert!(Scope::resolve(Path::new(path), home, 501).is_err());
    }
}
#[test]
fn reads_the_service_state_instead_of_nested_resource_states() {
    let observed = runtime("system/org.example.audit = {\n path = /Library/LaunchDaemons/audit.plist\n state = not running\n last exit code = 0\n resource = {\n state = active\n }\n}");
    assert!(!observed.running);
    assert_eq!(observed.exit.as_deref(), Some("0"));
    assert_eq!(
        observed.path.as_deref(),
        Some("/Library/LaunchDaemons/audit.plist")
    );
}
