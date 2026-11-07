use super::*;
use crate::core::automation::{Provider, Schedule};

fn task() -> AutomationTask {
    let mut task = AutomationTask::new(
        "agent_hub:example".into(),
        "Review".into(),
        "launchd",
        String::new(),
    );
    task.origin = TaskOrigin::AgentHub;
    task.can_edit = true;
    task.revision = Some(7);
    task.definition = Some(AutomationDraft {
        package_options: None,
        name: task.name.clone(),
        provider: Provider::System,
        content: "echo review".into(),
        workdir: Some("/tasks/review/project".into()),
        script_dir: Some("/tasks/review".into()),
        schedule: Schedule::Hourly { minute: 10 },
        enabled: true,
        files: vec![],
    });
    task
}

#[test]
fn copy_detaches_package_bindings_but_preserves_external_projects() {
    let temp = tempfile::tempdir().unwrap();
    let package = temp.path().join("review");
    let project = package.join("project");
    let external = temp.path().join("review-other");
    std::fs::create_dir_all(&project).unwrap();
    std::fs::create_dir(&external).unwrap();
    let mut source = task();
    let draft = source.definition.as_mut().unwrap();
    draft.script_dir = Some(package.to_string_lossy().into_owned());
    draft.workdir = Some(project.to_string_lossy().into_owned());
    let copy = from_task(&source, Some(7)).unwrap();
    assert!(copy.workdir.is_none() && copy.script_dir.is_none() && !copy.enabled);
    let draft = source.definition.as_mut().unwrap();
    draft.workdir = Some(external.to_string_lossy().into_owned());
    let copy = from_task(&source, Some(7)).unwrap();
    assert_eq!(copy.workdir.as_deref(), external.to_str());
    assert!(source.definition.as_ref().unwrap().enabled);
}

#[test]
fn copy_requires_a_current_editable_managed_definition() {
    let mut source = task();
    assert!(from_task(&source, Some(6)).is_err());
    source.origin = TaskOrigin::External;
    assert!(from_task(&source, None).is_err());
    source.origin = TaskOrigin::AgentHub;
    source.can_edit = false;
    assert!(from_task(&source, None).is_err());
    source.can_edit = true;
    source.definition = None;
    assert!(from_task(&source, None).is_err());
}

#[test]
#[cfg(unix)]
fn copy_detaches_project_aliases_into_the_original_package() {
    let temp = tempfile::tempdir().unwrap();
    let package = temp.path().join("package");
    let alias = temp.path().join("project-link");
    std::fs::create_dir(&package).unwrap();
    std::os::unix::fs::symlink(&package, &alias).unwrap();
    let mut source = task();
    let draft = source.definition.as_mut().unwrap();
    draft.script_dir = Some(package.to_string_lossy().into_owned());
    draft.workdir = Some(alias.to_string_lossy().into_owned());
    assert!(from_task(&source, None).unwrap().workdir.is_none());
}
