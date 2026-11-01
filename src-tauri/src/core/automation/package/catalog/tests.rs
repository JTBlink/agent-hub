use super::*;
fn task(root: &Path, name: &str) {
    let dir = root.join(name);
    std::fs::create_dir_all(&dir).unwrap();
    let package = serde_json::json!({"schema_version":1,"shell":crate::core::automation::command_shell(),
            "draft":{"name":name,"provider":"system","content":"echo example","workdir":null,
            "schedule":{"kind":"manual"},"enabled":true,"files":[]},"files":[]});
    std::fs::write(dir.join("task.json"), serde_json::to_vec(&package).unwrap()).unwrap();
}
#[test]
fn isolates_broken_tasks_and_previews_paused_snapshots() {
    let temp = tempfile::tempdir().unwrap();
    task(temp.path(), "automations/dev/a");
    task(temp.path(), "automations/dev/b");
    std::fs::write(temp.path().join("automations/dev/b/task.json"), "broken").unwrap();
    task(temp.path(), "skills/ignored");
    let result = scan(temp.path(), "fixed-commit".into()).unwrap();
    assert_eq!(result.revision, "fixed-commit");
    assert_eq!(result.packages.len(), 1);
    assert_eq!(result.issues.len(), 1);
    assert_eq!(result.packages[0].path, "automations/dev/a");
    assert!(!result.packages[0].package.draft.enabled);
    assert!(!temp.path().join("automations/dev/a/.local").exists());
}
#[test]
fn supports_a_task_at_repository_root() {
    let temp = tempfile::tempdir().unwrap();
    task(temp.path(), ".");
    assert_eq!(
        scan(temp.path(), "commit".into()).unwrap().packages[0].path,
        "."
    );
}
#[test]
fn rejects_local_and_command_transport_urls_before_fetch() {
    assert!(preview_git("ext::command", None, None).is_err());
    assert!(preview_git("file:///tmp/example", None, None).is_err());
}
#[test]
fn snapshot_keeps_the_previewed_script_bytes_after_source_changes() {
    let temp = tempfile::tempdir().unwrap();
    task(temp.path(), ".");
    let file = temp.path().join("task.json");
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&file).unwrap()).unwrap();
    manifest["files"] = serde_json::json!(["scripts/run.sh"]);
    std::fs::write(&file, serde_json::to_vec(&manifest).unwrap()).unwrap();
    std::fs::create_dir(temp.path().join("scripts")).unwrap();
    std::fs::write(temp.path().join("scripts/run.sh"), "echo first").unwrap();
    let first = scan(temp.path(), "first-commit".into()).unwrap();
    std::fs::write(temp.path().join("scripts/run.sh"), "echo changed").unwrap();
    assert_eq!(
        first.packages[0].package.draft.files[0].content,
        "echo first"
    );
    assert_eq!(
        scan(temp.path(), "next-commit".into()).unwrap().packages[0]
            .package
            .draft
            .files[0]
            .content,
        "echo changed"
    );
}
#[test]
fn limits_repository_task_count() {
    let temp = tempfile::tempdir().unwrap();
    for index in 0..101 {
        task(temp.path(), &format!("automations/task-{index}"));
    }
    assert!(scan(temp.path(), "commit".into())
        .err()
        .unwrap()
        .contains("Too many tasks"));
}
#[cfg(unix)]
#[test]
fn never_follows_repository_symlinks() {
    let temp = tempfile::tempdir().unwrap();
    let external = tempfile::tempdir().unwrap();
    task(external.path(), "private");
    std::os::unix::fs::symlink(external.path(), temp.path().join("linked")).unwrap();
    assert!(scan(temp.path(), "commit".into())
        .unwrap()
        .packages
        .is_empty());
}
