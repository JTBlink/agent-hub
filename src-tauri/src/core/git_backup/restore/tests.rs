use super::*;
use std::path::PathBuf;

fn remote(temp: &Path) -> PathBuf {
    let path = temp.join("remote");
    fs::create_dir_all(path.join("demo")).unwrap();
    fs::write(path.join("demo/SKILL.md"), "remote version").unwrap();
    init_repo_unlocked(&path, "Fixture").unwrap();
    path
}

#[test]
fn failed_reclone_preserves_live_files_and_git_history() {
    let temp = tempfile::tempdir().unwrap();
    let root = remote(temp.path());
    let before = git2::Repository::open(&root)
        .unwrap()
        .head()
        .unwrap()
        .target();
    let missing = temp.path().join("missing-remote");
    assert!(reclone_from_remote_unlocked(&root, missing.to_str().unwrap()).is_err());
    assert_eq!(
        fs::read_to_string(root.join("demo/SKILL.md")).unwrap(),
        "remote version"
    );
    assert_eq!(
        git2::Repository::open(root)
            .unwrap()
            .head()
            .unwrap()
            .target(),
        before
    );
    assert!(!temp.path().join(".agent-hub-recovery").exists());
}

#[test]
fn successful_restore_keeps_local_only_skills_and_every_recovery_copy() {
    let temp = tempfile::tempdir().unwrap();
    let remote = remote(temp.path());
    let root = temp.path().join("live");
    fs::create_dir_all(root.join("demo")).unwrap();
    fs::create_dir_all(root.join("local-only")).unwrap();
    fs::write(root.join("demo/SKILL.md"), "local version").unwrap();
    fs::write(root.join("local-only/SKILL.md"), "local only").unwrap();
    init_repo_unlocked(&root, "Fixture").unwrap();
    let before = git2::Repository::open(&root)
        .unwrap()
        .head()
        .unwrap()
        .target();
    #[cfg(unix)]
    std::os::unix::fs::symlink("local-only", root.join("linked")).unwrap();
    reclone_from_remote_unlocked(&root, remote.to_str().unwrap()).unwrap();
    assert_eq!(
        fs::read_to_string(root.join("demo/SKILL.md")).unwrap(),
        "remote version"
    );
    assert_eq!(
        fs::read_to_string(root.join("local-only/SKILL.md")).unwrap(),
        "local only"
    );
    #[cfg(unix)]
    assert_eq!(
        fs::read_link(root.join("linked")).unwrap(),
        PathBuf::from("local-only")
    );
    let recovery_parent = temp.path().join(".agent-hub-recovery");
    let recovery = fs::read_dir(&recovery_parent)
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    assert_eq!(
        fs::read_to_string(recovery.join("demo/SKILL.md")).unwrap(),
        "local version"
    );
    assert_eq!(
        git2::Repository::open(&recovery)
            .unwrap()
            .head()
            .unwrap()
            .target(),
        before
    );
    reclone_from_remote_unlocked(&root, remote.to_str().unwrap()).unwrap();
    assert_eq!(fs::read_dir(recovery_parent).unwrap().count(), 2);
    assert!(recovery.join("demo/SKILL.md").is_file());
}
