use super::*;
fn legacy(state: &Path) -> ManagedAutomation {
    let draft: AutomationDraft = serde_json::from_value(serde_json::json!({
        "name":"MR 处理", "provider":"system", "content":"printf keep", "workdir":null,
        "schedule":{"kind":"hourly","minute":30}, "enabled":false,
        "package_options":{"version":"1.2.3","dependencies":[],"hermes":null}
    }))
    .unwrap();
    let id = super::super::creation::stage(state, draft, vec![]).unwrap();
    let record = find(state, &id).unwrap();
    fs::rename(directory(&record).unwrap(), root(state).join("MR 处理")).unwrap();
    find(state, &id).unwrap()
}
#[test]
fn migrates_chinese_directory_without_changing_identity_schedule_content_or_history() {
    let temp = tempfile::tempdir().unwrap();
    let state = temp.path();
    let old = legacy(state);
    let old_path = directory(&old).unwrap();
    store::write(&old_path.join(".local/runs/saved.log"), b"retained output").unwrap();
    let mut binding = old.draft.clone();
    binding.workdir = Some(old_path.join("project").to_string_lossy().into_owned());
    json_write(
        &old_path.join(".local/binding.json"),
        &Binding {
            workdir: binding.workdir,
        },
    )
    .unwrap();
    let old = find(state, &old.id).unwrap();
    migrate(state, &old.id).unwrap();
    let next = find(state, &old.id).unwrap();
    let target = directory(&next).unwrap();
    assert_eq!(target.file_name().unwrap(), "agent-mr-processing");
    assert!(!old_path.exists());
    assert_eq!(next.id, old.id);
    assert_eq!(next.revision, old.revision + 1);
    assert_eq!(next.draft.name, old.draft.name);
    assert_eq!(next.draft.schedule, old.draft.schedule);
    assert_eq!(next.draft.content, old.draft.content);
    assert_eq!(next.draft.files, old.draft.files);
    assert_eq!(next.draft.package_options, old.draft.package_options);
    assert_eq!(
        next.draft.workdir.as_deref(),
        target.join("project").to_str()
    );
    assert_eq!(
        fs::read(target.join(".local/runs/saved.log")).unwrap(),
        b"retained output"
    );
    assert_eq!(receipt(&next).unwrap().state, "pending");
    assert!(receipt(&next).unwrap().pending_backup);
    assert!(!journal_path(state, &old.id).exists());
    migrate(state, &old.id).unwrap();
    assert_eq!(find(state, &old.id).unwrap().revision, next.revision);
}
#[test]
fn refuses_installed_running_and_unowned_environments_without_moving_data() {
    let temp = tempfile::tempdir().unwrap();
    let old = legacy(temp.path());
    let path = directory(&old).unwrap();
    let mut installed = receipt(&old).unwrap();
    installed.state = "ready".into();
    write_receipt(&old, &installed).unwrap();
    assert!(migrate(temp.path(), &old.id).is_err());
    installed.state = "removed".into();
    write_receipt(&old, &installed).unwrap();
    for name in ["run.claim", "ready", "env"] {
        fs::create_dir(path.join(".local").join(name)).unwrap();
        assert!(migrate(temp.path(), &old.id).is_err());
        assert!(path.join("task.json").is_file());
        fs::remove_dir(path.join(".local").join(name)).unwrap();
    }
}
#[test]
fn another_tasks_project_binding_blocks_migration_and_occupied_names_are_preserved() {
    let temp = tempfile::tempdir().unwrap();
    let old = legacy(temp.path());
    let path = directory(&old).unwrap();
    let mut shared = old.draft.clone();
    shared.script_dir = None;
    shared.workdir = Some(path.to_string_lossy().into_owned());
    let other = super::super::creation::stage(temp.path(), shared, vec![]).unwrap();
    assert!(migrate(temp.path(), &old.id).is_err());
    let other = find(temp.path(), &other).unwrap();
    let occupied = directory(&other).unwrap();
    store::write(&occupied.join(".local/binding.json"), b"{\"workdir\":null}").unwrap();
    migrate(temp.path(), &old.id).unwrap();
    assert_eq!(
        directory(&find(temp.path(), &old.id).unwrap())
            .unwrap()
            .file_name()
            .unwrap(),
        "agent-mr-processing-2"
    );
    assert!(occupied.join("task.json").is_file());
}
#[test]
fn recovers_an_interrupted_move_before_retrying_and_rejects_foreign_journals() {
    let temp = tempfile::tempdir().unwrap();
    let old = legacy(temp.path());
    let from = directory(&old).unwrap();
    let to = super::super::super::workspace::allocate(&root(temp.path()), &old.draft.name).unwrap();
    let journal = Journal {
        id: old.id.clone(),
        from: from.clone(),
        to: to.clone(),
        receipt: receipt(&old).unwrap(),
        binding: Binding { workdir: None },
    };
    json_write(&journal_path(temp.path(), &old.id), &journal).unwrap();
    fs::rename(&from, &to).unwrap();
    migrate(temp.path(), &old.id).unwrap();
    let next = find(temp.path(), &old.id).unwrap();
    assert_eq!(next.revision, 2);
    assert_eq!(directory(&next).unwrap(), to);
    let mut foreign = journal;
    foreign.to = temp.path().join("outside");
    json_write(&journal_path(temp.path(), &old.id), &foreign).unwrap();
    assert!(migrate(temp.path(), &old.id).is_err());
    assert!(directory(&next).unwrap().join("task.json").is_file());
}
