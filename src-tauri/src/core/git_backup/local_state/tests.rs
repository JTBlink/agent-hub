use super::*;
use std::fs;

#[test]
fn backup_excludes_root_app_state_but_keeps_skill_fixtures_and_portable_metadata() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    fs::create_dir_all(root.join("demo/logs")).unwrap();
    fs::create_dir_all(root.join("logs")).unwrap();
    fs::create_dir_all(root.join("credentials")).unwrap();
    fs::create_dir_all(root.join(".agent-hub/skills")).unwrap();
    for path in [
        "agent-hub.db",
        "logs/debug.log",
        "repo-config.json",
        "credentials/fixture.json",
        ".skill-lock.json",
        "demo/agent-hub.db",
        "demo/logs/fixture.log",
        ".agent-hub/skills/demo.json",
    ] {
        fs::write(root.join(path), "fixture").unwrap();
    }
    run_git_checked(root, &["init"]).unwrap();
    run_git_checked(root, &["add", "-A"]).unwrap();
    ensure_gitignore(root).unwrap();
    run_git_checked(root, &["add", "-A"]).unwrap();
    let tracked = run_git(root, &["ls-files"]).unwrap();
    for path in [
        "agent-hub.db",
        "logs/debug.log",
        "repo-config.json",
        "credentials/fixture.json",
        ".skill-lock.json",
    ] {
        assert!(!tracked.lines().any(|line| line == path), "{path}");
        assert!(root.join(path).is_file());
    }
    for path in [
        "demo/agent-hub.db",
        "demo/logs/fixture.log",
        ".agent-hub/skills/demo.json",
    ] {
        assert!(tracked.lines().any(|line| line == path), "{path}");
    }
    let first = fs::read(root.join(".gitignore")).unwrap();
    ensure_gitignore(root).unwrap();
    assert_eq!(fs::read(root.join(".gitignore")).unwrap(), first);
}
