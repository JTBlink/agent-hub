use super::*;

#[test]
fn external_task_ids_do_not_depend_on_the_managed_registry() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("tasks.json"), "damaged registry").unwrap();
    assert!(native_task_at(dir.path(), "hermes:default:job")
        .unwrap()
        .is_none());
}

#[test]
fn local_output_remains_readable_while_an_automation_write_lock_is_held() {
    let case = super::super::local_data::tests::Fixture::new();
    store::save(&case.state, vec![case.record.clone()]).unwrap();
    let directory = native::directory(&case.state, &case.record);
    fs::write(directory.join("output.log"), "saved evidence").unwrap();
    let _writer = store::Lock::acquire(&case.state).unwrap();
    let (record, directory) = native_task_at(&case.state, &case.record.id)
        .unwrap()
        .unwrap();
    assert_eq!(record.id, case.record.id);
    assert_eq!(latest_native(&directory).unwrap().content, "saved evidence");
    assert!(native_task_at(&case.state, "missing").unwrap().is_none());
}

#[test]
fn reads_bounded_tail_and_powershell_utf16_output() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("output.log");
    fs::write(&path, vec![b'x'; OUTPUT_LIMIT as usize + 20]).unwrap();
    let output = read_output(dir.path(), &path).unwrap();
    assert!(output.truncated);
    assert_eq!(output.content.len(), OUTPUT_LIMIT as usize);
    let bytes: Vec<_> = "\u{feff}完成\n"
        .encode_utf16()
        .flat_map(u16::to_le_bytes)
        .collect();
    fs::write(&path, bytes).unwrap();
    assert_eq!(read_output(dir.path(), &path).unwrap().content, "完成\n");
}

#[test]
fn reads_latest_hermes_result_without_creating_a_history_store() {
    let root = tempfile::tempdir().unwrap();
    assert!(latest_hermes(root.path(), "audit").unwrap().is_none());
    assert!(!root.path().join("cron").exists());
    let dir = root.path().join("cron/output/audit");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("2026-10-26_09-00-00.md"), "older").unwrap();
    fs::write(dir.join("2026-10-27_09-00-00.md"), "latest").unwrap();
    fs::write(dir.join("other.md"), "ignore").unwrap();
    assert_eq!(
        fs::read_to_string(latest_hermes(root.path(), "audit").unwrap().unwrap()).unwrap(),
        "latest"
    );
    assert_eq!(fs::read_dir(&dir).unwrap().count(), 3);
    assert!(latest_hermes(root.path(), "../outside").is_err());
}
#[cfg(unix)]
#[test]
fn refuses_symlinked_provider_output() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("secret"), "secret").unwrap();
    std::os::unix::fs::symlink(
        outside.path().join("secret"),
        root.path().join("output.log"),
    )
    .unwrap();
    assert!(read_output(root.path(), &root.path().join("output.log")).is_err());
    std::os::unix::fs::symlink(outside.path(), root.path().join("cron")).unwrap();
    assert!(latest_hermes(root.path(), "audit").is_err());
}
