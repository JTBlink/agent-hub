use super::*;
use crate::core::automation::{Provider, Schedule};

fn damaged_package() -> (tempfile::TempDir, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let draft = AutomationDraft {
        package_options: None,
        name: "巡检任务".into(),
        description: None,
        provider: Provider::System,
        content: "echo ready".into(),
        workdir: None,
        script_dir: None,
        schedule: Schedule::Manual,
        enabled: false,
        files: Vec::new(),
    };
    let id = super::super::creation::stage(temp.path(), draft, Vec::new()).unwrap();
    let record = super::super::find(temp.path(), &id).unwrap();
    let path = super::super::directory(&record).unwrap();
    fs::write(path.join("TASK.md"), "x".repeat(65537)).unwrap();
    (temp, path)
}

#[test]
fn failed_package_names_the_automation_and_its_directory() {
    let (temp, path) = damaged_package();
    let (_, issues) = discover(temp.path());
    assert_eq!(issues.len(), 1);
    assert!(issues[0].starts_with("巡检任务 ["), "{}", issues[0]);
    assert!(issues[0].contains(path.file_name().unwrap().to_str().unwrap()));
    assert!(issues[0].contains("Task files require unique"));
}

#[test]
fn failed_package_falls_back_to_directory_when_name_is_unreadable_or_invalid() {
    let (temp, path) = damaged_package();
    let manifest = manifest_path(&path);
    let mut value: serde_json::Value = json(&manifest).unwrap();
    let directory = path.file_name().unwrap().to_str().unwrap();
    for name in [
        serde_json::Value::Null,
        serde_json::json!(" "),
        serde_json::json!("bad\nname"),
        serde_json::json!("x".repeat(201)),
    ] {
        value["draft"]["name"] = name;
        fs::write(&manifest, serde_json::to_vec(&value).unwrap()).unwrap();
        let (_, issues) = discover(temp.path());
        assert!(
            issues[0].starts_with(&format!("{directory}: ")),
            "{}",
            issues[0]
        );
    }
    fs::write(&manifest, "broken").unwrap();
    let (_, issues) = discover(temp.path());
    assert!(issues[0].starts_with(&format!("{directory}: ")));
}
