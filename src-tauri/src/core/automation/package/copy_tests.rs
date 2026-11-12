use super::*;
use crate::core::automation::{
    AutomationScriptFile, AutomationTask, Provider, Schedule, TaskOrigin,
};

#[test]
fn copied_packages_preserve_all_declared_content_and_isolate_edits_and_private_state() {
    let temp = tempfile::tempdir().unwrap();
    let project = temp.path().join("project");
    std::fs::create_dir(&project).unwrap();
    let draft = AutomationDraft {
        package_options: Some(PackageOptions {
            version: Some("1.2.3".into()),
            dependencies: vec![Dependency::Command { name: "git".into() }],
            hermes: None,
        }),
        name: "Review".into(),
        description: None,
        provider: Provider::System,
        content: "echo review".into(),
        workdir: Some(project.to_string_lossy().into_owned()),
        script_dir: None,
        schedule: Schedule::Hourly { minute: 15 },
        enabled: true,
        files: [
            ("prompts/prompt.md", "Review the request"),
            ("config/prompt-variants.json", r#"{"version":1,"active_id":"review","variants":[{"id":"review","name":"Review"},{"id":"repair","name":"Repair","content":"Repair and verify"}]}"#),
            ("config/settings.json", r#"{"limit":3}"#),
            ("references/guide.md", "Review guide"),
            ("scripts/helper.sh", "echo helper"),
        ]
        .into_iter()
        .map(|(path, content)| AutomationScriptFile {
            path: path.into(),
            content: content.into(),
        })
        .collect(),
    };
    let id = creation::stage(temp.path(), draft, vec![]).unwrap();
    let original = find(temp.path(), &id).unwrap();
    let path = directory(&original).unwrap();
    std::fs::create_dir_all(path.join(".local/state")).unwrap();
    std::fs::write(path.join(".local/state/task-state.json"), "private state").unwrap();
    std::fs::write(path.join(".local/output.log"), "previous output").unwrap();
    let mut task = AutomationTask::new(id.clone(), "Review".into(), "launchd", String::new());
    task.origin = TaskOrigin::AgentHub;
    task.can_edit = true;
    task.revision = Some(original.revision);
    task.definition = Some(original.draft.clone());
    let mut copy = super::super::copy::from_task(&task, task.revision).unwrap();
    copy.name = "Review copy".into();
    let copy_id = creation::stage(temp.path(), copy, vec![]).unwrap();
    let copied = find(temp.path(), &copy_id).unwrap();
    let copy_path = directory(&copied).unwrap();
    assert_ne!(id, copy_id);
    assert_ne!(path, copy_path);
    assert!(!copied.draft.enabled);
    assert_eq!(copied.draft.files, original.draft.files);
    assert_eq!(copied.draft.content, original.draft.content);
    assert_eq!(copied.draft.schedule, original.draft.schedule);
    assert_eq!(copied.draft.workdir, original.draft.workdir);
    assert_eq!(copied.draft.package_options, original.draft.package_options);
    assert!(!copy_path.join(".local/state/task-state.json").exists());
    assert!(!copy_path.join(".local/output.log").exists());
    std::fs::write(copy_path.join("prompts/prompt.md"), "Updated request").unwrap();
    assert_eq!(
        std::fs::read_to_string(path.join("prompts/prompt.md")).unwrap(),
        "Review the request"
    );
    assert_eq!(
        std::fs::read_to_string(path.join(".local/state/task-state.json")).unwrap(),
        "private state"
    );
}
