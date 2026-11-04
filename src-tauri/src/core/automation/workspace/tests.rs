use super::*;
fn draft() -> AutomationDraft {
    AutomationDraft {
        package_options: None,
        files: Vec::new(),
        name: "audit".into(),
        provider: super::super::Provider::System,
        content: "exit 0".into(),
        script_dir: None,
        workdir: None,
        schedule: super::super::Schedule::Manual,
        enabled: true,
    }
}
#[test]
fn localized_task_names_use_portable_english_directory_slugs() {
    for (name, expected) in [
        ("PR / MR 代码审查", "agent-mr-processing"),
        ("PR / MR 程式碼審查", "agent-mr-processing"),
        ("PR / MR code review", "agent-mr-processing"),
        ("MR 处理", "agent-mr-processing"),
        ("MR 處理", "agent-mr-processing"),
        ("MR / PR processing", "agent-mr-processing"),
        ("项目巡检", "agent-maintenance"),
        ("定时重置网络", "network-reset"),
        ("自定义任务", "task"),
        ("My 自定义 Task", "my-task"),
        ("../../", "task"),
        ("CON.txt", "task-con.txt"),
    ] {
        assert_eq!(directory_name(name), expected);
        assert!(directory_name(name).is_ascii());
    }
}
#[test]
fn omitted_directories_create_separate_reusable_workspaces_without_running_commands() {
    let temporary = tempfile::tempdir().unwrap();
    let state = temporary.path().join("state");
    let root = temporary.path().join("workspaces");
    let id = format!("agent_hub:{}", uuid::Uuid::new_v4());
    let mut first = draft();
    ensure_at(&root, &state, &mut first, &id, "").unwrap();
    let first_path = Path::new(first.workdir.as_ref().unwrap());
    assert!(first_path.is_dir());
    assert_eq!(first_path.file_name().unwrap(), "audit");
    assert!(!first_path
        .to_string_lossy()
        .contains(id.trim_start_matches("agent_hub:")));
    std::fs::write(first_path.join("result.txt"), "keep").unwrap();
    let mut same = draft();
    same.name = "Renamed".into();
    ensure_at(&root, &state, &mut same, &id, "").unwrap();
    assert_eq!(first.workdir, same.workdir);
    assert_eq!(
        std::fs::read_to_string(first_path.join("result.txt")).unwrap(),
        "keep"
    );
    let mut second = draft();
    ensure_at(
        &root,
        &state,
        &mut second,
        "hermes:profile:../../id",
        "profile/jobs.json",
    )
    .unwrap();
    assert_ne!(first.workdir, second.workdir);
    assert_eq!(
        Path::new(second.workdir.as_ref().unwrap())
            .file_name()
            .unwrap(),
        "audit-2"
    );
    assert!(is_default_at(
        &root,
        &state,
        first.workdir.as_deref().unwrap(),
        &id
    ));
    assert!(!is_default_at(
        &root,
        &state,
        second.workdir.as_deref().unwrap(),
        &id
    ));
    assert!(is_default_at(
        &root,
        &state,
        root.join(key(&id, "")).join("workspace").to_str().unwrap(),
        &id
    ));
}
#[test]
fn explicit_directories_are_preserved_and_do_not_create_default_folders() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().join("unused");
    let mut draft = draft();
    draft.workdir = Some(temporary.path().to_string_lossy().into_owned());
    ensure_at(
        &root,
        &temporary.path().join("state"),
        &mut draft,
        "id",
        "scope",
    )
    .unwrap();
    assert!(!root.exists());
    assert_eq!(draft.workdir.as_deref(), temporary.path().to_str());
    assert_ne!(key("same", "first"), key("same", "second"));
}

#[test]
fn occupied_names_and_unsafe_task_names_do_not_overwrite_existing_files() {
    let temp = tempfile::tempdir().unwrap();
    let state = temp.path().join("state");
    let root = temp.path().join("workspaces");
    std::fs::create_dir_all(root.join("audit")).unwrap();
    std::fs::write(root.join("audit/keep.txt"), "keep").unwrap();
    let mut task = draft();
    ensure_at(&root, &state, &mut task, "first", "").unwrap();
    assert_eq!(task.workdir.as_deref(), root.join("audit-2").to_str());
    assert_eq!(
        std::fs::read_to_string(root.join("audit/keep.txt")).unwrap(),
        "keep"
    );
    let mut task = draft();
    task.name = "../../磁盘/清理".into();
    ensure_at(&root, &state, &mut task, "second", "").unwrap();
    let path = Path::new(task.workdir.as_deref().unwrap());
    assert_eq!(path.parent(), Some(root.as_path()));
    assert_eq!(path.file_name().unwrap(), "task");
    assert_eq!(
        allocate(&root, "con.txt").unwrap(),
        root.join("task-con.txt")
    );
}

#[test]
fn missing_or_invalid_assignments_require_repair_instead_of_silently_replacing_data() {
    let temp = tempfile::tempdir().unwrap();
    let state = temp.path().join("state");
    let root = temp.path().join("workspaces");
    let mut task = draft();
    ensure_at(&root, &state, &mut task, "first", "").unwrap();
    std::fs::remove_dir(task.workdir.unwrap()).unwrap();
    assert!(ensure_at(&root, &state, &mut draft(), "first", "").is_err());
    for name in [
        "..",
        ".",
        "../outside",
        "nested/directory",
        "nested\\directory",
    ] {
        store::write(
            &assignment(&state, "second", ""),
            &serde_json::to_vec(name).unwrap(),
        )
        .unwrap();
        assert!(ensure_at(&root, &state, &mut draft(), "second", "").is_err());
    }
}

#[cfg(unix)]
#[test]
fn symlinked_names_are_not_adopted_or_reused() {
    let temp = tempfile::tempdir().unwrap();
    let state = temp.path().join("state");
    let root = temp.path().join("workspaces");
    let outside = temp.path().join("outside");
    std::fs::create_dir_all(&root).unwrap();
    std::fs::create_dir(&outside).unwrap();
    std::os::unix::fs::symlink(&outside, root.join("audit")).unwrap();
    let mut task = draft();
    ensure_at(&root, &state, &mut task, "first", "").unwrap();
    assert_eq!(task.workdir.as_deref(), root.join("audit-2").to_str());
    std::fs::remove_dir(root.join("audit-2")).unwrap();
    std::os::unix::fs::symlink(&outside, root.join("audit-2")).unwrap();
    assert!(ensure_at(&root, &state, &mut draft(), "first", "").is_err());
    assert!(std::fs::read_dir(&outside).unwrap().next().is_none());
}
