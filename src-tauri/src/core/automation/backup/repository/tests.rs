use super::*;
use crate::core::automation::{AutomationScriptFile, Provider, Schedule};
fn record() -> AutomationBackup {
    AutomationBackup {
        schema_version: 1,
        id: format!("agent_hub:{}", uuid::Uuid::new_v4()),
        shell: shell().into(),
        draft: AutomationDraft {
            package_options: None,
            name: "Example task".into(),
            provider: Provider::System,
            content: "echo example".into(),
            workdir: None,
            script_dir: None,
            files: vec![AutomationScriptFile {
                path: "prompt.md".into(),
                content: "Review the project".into(),
            }],
            enabled: true,
            schedule: Schedule::Hourly { minute: 15 },
        },
    }
}
#[test]
fn publishes_real_task_directories_and_imports_without_local_runtime() {
    let temp = tempfile::tempdir().unwrap();
    let meta = temp.path().join("metadata");
    let repo = temp.path().join("repository");
    fs::create_dir(&repo).unwrap();
    let one = record();
    let mut two = one.clone();
    two.id = format!("agent_hub:{}", uuid::Uuid::new_v4());
    for task in [&one, &two] {
        store::write(
            &meta.join(filename(&task.id).unwrap()),
            &serde_json::to_vec(task).unwrap(),
        )
        .unwrap();
    }
    export(&meta, &repo).unwrap();
    let tasks: Vec<_> = fs::read_dir(repo.join("automations"))
        .unwrap()
        .map(|e| e.unwrap().path())
        .collect();
    assert_eq!(tasks.len(), 2);
    let names: BTreeSet<_> = tasks
        .iter()
        .map(|path| path.file_name().unwrap().to_str().unwrap())
        .collect();
    assert_eq!(names, BTreeSet::from(["example-task", "example-task-2"]));
    for task in &tasks {
        assert!(!task.join(".local").exists());
        let package = package::preview_package(task).unwrap();
        assert!(!package.draft.enabled);
        assert!(package.draft.workdir.is_none());
        assert!(task.join("prompt.md").is_file());
        assert!(task.join("scripts").is_dir());
    }
    let target = temp.path().join("restored");
    import(&repo, &target).unwrap();
    assert_eq!(read(&target).unwrap().len(), 2);
    assert!(read(&target).unwrap().values().all(|r| !r.draft.enabled));
    assert!(!target.join("tasks.json").exists());
    store::write(
        &meta.join(filename(&one.id).unwrap()),
        &serde_json::to_vec(&AutomationBackup {
            draft: AutomationDraft {
                name: "Renamed".into(),
                ..one.draft.clone()
            },
            ..one.clone()
        })
        .unwrap(),
    )
    .unwrap();
    fs::remove_file(meta.join(filename(&two.id).unwrap())).unwrap();
    export(&meta, &repo).unwrap();
    import(&repo, &target).unwrap();
    assert_eq!(read(&target).unwrap().len(), 1);
    assert_eq!(
        read(&target).unwrap().values().next().unwrap().draft.name,
        "Renamed"
    );
}
#[test]
fn accepts_old_backups_and_migrates_only_the_repository_representation() {
    let temp = tempfile::tempdir().unwrap();
    let repo = temp.path().join("repo");
    let old = repo.join(".agent-hub");
    let task = record();
    store::write(
        &old.join(filename(&task.id).unwrap()),
        &serde_json::to_vec(&task).unwrap(),
    )
    .unwrap();
    let local = temp.path().join("local");
    import(&repo, &local).unwrap();
    assert_eq!(
        read(&local).unwrap().values().next().unwrap().draft,
        task.draft
    );
    export(&local, &repo).unwrap();
    assert!(read(&old).unwrap().is_empty());
    assert_eq!(fs::read_dir(repo.join("automations")).unwrap().count(), 1);
    import(&repo, &local).unwrap();
    assert_eq!(read(&local).unwrap().values().next().unwrap().id, task.id);
}
fn write_records(metadata: &Path, records: &[AutomationBackup]) {
    for record in records {
        store::write(
            &metadata.join(filename(&record.id).unwrap()),
            &serde_json::to_vec(record).unwrap(),
        )
        .unwrap();
    }
}

#[test]
fn publishes_plain_task_names_and_keeps_identity_inside_the_manifest() {
    let temp = tempfile::tempdir().unwrap();
    let repo = temp.path().join("repository");
    let metadata = temp.path().join("metadata");
    fs::create_dir(&repo).unwrap();
    let mut one = record();
    one.draft.name = "定时重置网络".into();
    let mut two = record();
    two.draft.name = "MR 处理".into();
    write_records(&metadata, &[one.clone(), two.clone()]);
    for _ in 0..2 {
        export(&metadata, &repo).unwrap();
        assert_eq!(fs::read_dir(repo.join("automations")).unwrap().count(), 2);
        for (record, slug) in [(&one, "network-reset"), (&two, "agent-mr-processing")] {
            let directory = repo.join("automations").join(slug);
            assert!(directory.join("task.json").is_file());
            assert_eq!(
                package::read_backup_directory(&directory).unwrap().id,
                record.id
            );
            assert!(!directory.join(".local").exists());
        }
    }
}

#[test]
fn collision_suffixes_do_not_take_another_tasks_natural_name() {
    let temp = tempfile::tempdir().unwrap();
    let repo = temp.path().join("repository");
    fs::create_dir(&repo).unwrap();
    let metadata = temp.path().join("metadata");
    let records: Vec<_> = ["A/B", "A B", "a-b-2"]
        .into_iter()
        .map(|name| {
            let mut record = record();
            record.draft.name = name.into();
            record
        })
        .collect();
    write_records(&metadata, &records);
    export(&metadata, &repo).unwrap();
    let names: BTreeSet<_> = fs::read_dir(repo.join("automations"))
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_str().unwrap().to_owned())
        .collect();
    assert_eq!(
        names,
        BTreeSet::from(["a-b".into(), "a-b-2".into(), "a-b-3".into()])
    );
    assert_eq!(
        package::read_backup_directory(&repo.join("automations/a-b-2"))
            .unwrap()
            .draft
            .name,
        "a-b-2"
    );
    let target = temp.path().join("restored");
    import(&repo, &target).unwrap();
    let ids: BTreeSet<_> = read(&target)
        .unwrap()
        .into_values()
        .map(|record| record.id)
        .collect();
    assert_eq!(ids, records.into_iter().map(|record| record.id).collect());
}

#[test]
fn avoids_case_unicode_and_reserved_device_name_collisions() {
    let temp = tempfile::tempdir().unwrap();
    let repo = temp.path().join("repository");
    fs::create_dir(&repo).unwrap();
    let metadata = temp.path().join("metadata");
    let records: Vec<_> = ["Audit", "audit", "Café", "Cafe\u{301}", "CON.txt"]
        .into_iter()
        .map(|name| {
            let mut record = record();
            record.draft.name = name.into();
            record
        })
        .collect();
    write_records(&metadata, &records);
    export(&metadata, &repo).unwrap();
    let names: BTreeSet<_> = fs::read_dir(repo.join("automations"))
        .unwrap()
        .map(|entry| name_key(entry.unwrap().file_name().to_str().unwrap()))
        .collect();
    assert_eq!(names.len(), records.len());
    assert!(repo.join("automations/task-con.txt/task.json").is_file());
    let target = temp.path().join("restored");
    import(&repo, &target).unwrap();
    assert_eq!(read(&target).unwrap().len(), records.len());
}

#[test]
fn reads_uuid_suffixed_directories_and_rewrites_them_on_the_next_export() {
    let temp = tempfile::tempdir().unwrap();
    let repo = temp.path().join("repository");
    fs::create_dir(&repo).unwrap();
    let metadata = temp.path().join("metadata");
    let task = record();
    write_records(&metadata, std::slice::from_ref(&task));
    export(&metadata, &repo).unwrap();
    let plain = repo.join("automations/example-task");
    let old = repo.join("automations").join(format!(
        "{}--{}",
        task.draft.name,
        task.id.trim_start_matches("agent_hub:")
    ));
    fs::rename(&plain, &old).unwrap();
    let restored = temp.path().join("restored");
    import(&repo, &restored).unwrap();
    assert_eq!(
        read(&restored).unwrap().values().next().unwrap().id,
        task.id
    );
    export(&restored, &repo).unwrap();
    assert!(!old.exists());
    assert!(plain.join("task.json").is_file());
    assert_eq!(package::read_backup_directory(&plain).unwrap().id, task.id);
}

#[cfg(unix)]
#[test]
fn rejects_links_and_damaged_backups_before_replacing_local_definitions() {
    let temp = tempfile::tempdir().unwrap();
    let repo = temp.path().join("repo");
    fs::create_dir(&repo).unwrap();
    let meta = temp.path().join("meta");
    let task = record();
    store::write(
        &meta.join(filename(&task.id).unwrap()),
        &serde_json::to_vec(&task).unwrap(),
    )
    .unwrap();
    export(&meta, &repo).unwrap();
    let directory = fs::read_dir(repo.join("automations"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    fs::remove_file(directory.join("prompt.md")).unwrap();
    std::os::unix::fs::symlink(temp.path().join("outside"), directory.join("prompt.md")).unwrap();
    let before = fs::read(meta.join(filename(&task.id).unwrap())).unwrap();
    assert!(import(&repo, &meta).is_err());
    assert_eq!(
        fs::read(meta.join(filename(&task.id).unwrap())).unwrap(),
        before
    );
}
