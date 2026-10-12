use super::*;
use std::fs;

#[test]
fn failed_publication_restores_the_previous_project_directory() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("center");
    let target = temp.path().join("project").join("demo");
    fs::create_dir_all(&source).unwrap();
    fs::create_dir_all(&target).unwrap();
    fs::write(source.join("SKILL.md"), "center version").unwrap();
    fs::write(target.join("SKILL.md"), "project version").unwrap();
    fs::write(target.join("local.txt"), "local content").unwrap();
    replacement::FAIL_PUBLICATION.with(|value| value.set(true));
    let result = sync_skill(
        &source,
        &target,
        SyncMode::Copy,
        ReplacePolicy::UserConfirmed,
    );
    replacement::FAIL_PUBLICATION.with(|value| value.set(false));
    assert!(result.is_err());
    assert_eq!(
        fs::read_to_string(target.join("SKILL.md")).unwrap(),
        "project version"
    );
    assert_eq!(
        fs::read_to_string(target.join("local.txt")).unwrap(),
        "local content"
    );
    sync_skill(
        &source,
        &target,
        SyncMode::Copy,
        ReplacePolicy::UserConfirmed,
    )
    .unwrap();
    assert_eq!(
        fs::read_to_string(target.join("SKILL.md")).unwrap(),
        "center version"
    );
    assert!(!target.join("local.txt").exists());
    assert_eq!(fs::read_dir(target.parent().unwrap()).unwrap().count(), 1);
}

#[cfg(unix)]
#[test]
fn failed_publication_restores_the_previous_relative_link() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("center");
    let previous = temp.path().join("previous");
    let target = temp.path().join("project").join("demo");
    fs::create_dir_all(&source).unwrap();
    fs::create_dir_all(&previous).unwrap();
    fs::create_dir_all(target.parent().unwrap()).unwrap();
    fs::write(source.join("SKILL.md"), "center version").unwrap();
    fs::write(previous.join("SKILL.md"), "project version").unwrap();
    std::os::unix::fs::symlink("../previous", &target).unwrap();
    replacement::FAIL_PUBLICATION.with(|value| value.set(true));
    let result = sync_skill(
        &source,
        &target,
        SyncMode::Symlink,
        ReplacePolicy::UserConfirmed,
    );
    replacement::FAIL_PUBLICATION.with(|value| value.set(false));
    assert!(result.is_err());
    assert_eq!(fs::read_link(&target).unwrap(), Path::new("../previous"));
    assert_eq!(
        fs::read_to_string(target.join("SKILL.md")).unwrap(),
        "project version"
    );
    assert!(source.join("SKILL.md").is_file());
}

#[cfg(unix)]
#[test]
fn failed_copy_preserves_existing_project_skill() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("center");
    let target = temp.path().join("project").join("demo");
    fs::create_dir_all(&source).unwrap();
    fs::create_dir_all(&target).unwrap();
    fs::write(source.join("SKILL.md"), "center version").unwrap();
    fs::write(target.join("SKILL.md"), "project version").unwrap();
    fs::write(target.join("local.txt"), "local content").unwrap();
    std::os::unix::fs::symlink(source.join("missing.txt"), source.join("broken.txt")).unwrap();

    assert!(sync_skill(
        &source,
        &target,
        SyncMode::Copy,
        ReplacePolicy::UserConfirmed
    )
    .is_err());
    assert_eq!(
        fs::read_to_string(target.join("SKILL.md")).unwrap(),
        "project version"
    );
    assert_eq!(
        fs::read_to_string(target.join("local.txt")).unwrap(),
        "local content"
    );
}
