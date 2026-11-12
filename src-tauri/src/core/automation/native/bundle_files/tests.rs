use super::*;
use crate::core::automation::{Provider, Schedule};
#[test]
fn complete_cleanup_bundle_roundtrips_modules_config_and_readme() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("runtime");
    let workspace = temp.path().join("workspace");
    fs::create_dir_all(&workspace).unwrap();
    let mut draft = crate::core::automation::templates(Some("en"))
        .templates
        .into_iter()
        .find(|template| template.id == "disk-cleanup")
        .unwrap()
        .draft;
    draft.workdir = Some(workspace.to_string_lossy().into_owned());
    draft.validate().unwrap();
    let id = format!("agent_hub:{}", uuid::Uuid::new_v4());
    let dir = root.join(id.trim_start_matches("agent_hub:"));
    write(&dir, &draft, &id, false).unwrap();
    let record = ManagedAutomation {
        id,
        revision: 1,
        draft: draft.clone(),
        source: "test".into(),
        identifier: "test".into(),
        location: String::new(),
    };
    assert_eq!(read(&record).unwrap(), draft.files);
    assert!(workspace.join("scripts/cleanup_actions.py").is_file());
    let config = draft
        .files
        .iter()
        .find(|file| file.path.ends_with("cleanup-config.json"))
        .unwrap();
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&config.content).unwrap()["notify"],
        true
    );
}
#[test]
fn refuses_unmanaged_files_and_linked_template_directories() {
    let temp = tempfile::tempdir().unwrap();
    let runtime = temp
        .path()
        .join("runtime")
        .join(uuid::Uuid::new_v4().to_string());
    let workspace = temp.path().join("workspace");
    let outside = temp.path().join("outside");
    fs::create_dir_all(workspace.join("bundle")).unwrap();
    fs::create_dir(&outside).unwrap();
    let draft = AutomationDraft {
        package_options: None,
        name: "Template".into(),
        description: None,
        provider: Provider::System,
        content: "python3 bundle/main.py".into(),
        files: vec![AutomationScriptFile {
            path: "bundle/main.py".into(),
            content: "print('template')".into(),
        }],
        script_dir: None,
        workdir: Some(workspace.to_string_lossy().into_owned()),
        schedule: Schedule::Manual,
        enabled: false,
    };
    let id = format!("agent_hub:{}", uuid::Uuid::new_v4());
    fs::write(workspace.join("bundle/main.py"), "preserve user script").unwrap();
    assert!(write(&runtime, &draft, &id, true).is_err());
    assert_eq!(
        fs::read_to_string(workspace.join("bundle/main.py")).unwrap(),
        "preserve user script"
    );
    fs::remove_file(workspace.join("bundle/main.py")).unwrap();
    fs::remove_dir(workspace.join("bundle")).unwrap();
    std::os::unix::fs::symlink(&outside, workspace.join("bundle")).unwrap();
    assert!(write(&runtime, &draft, &id, true).is_err());
    assert!(!outside.join("main.py").exists());
}
