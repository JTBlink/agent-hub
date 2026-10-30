use super::*;
use crate::core::automation::{AutomationDraft, AutomationScriptFile, Provider};

#[test]
fn scripts_stay_in_storage_while_execution_and_project_changes_use_the_selected_directory() {
    let temp = tempfile::tempdir().unwrap();
    let storage = temp.path().join("scripts ' quoted");
    let project = temp.path().join("project ' one");
    let second = temp.path().join("project two");
    for path in [&storage, &project, &second] {
        std::fs::create_dir(path).unwrap();
    }
    let runtime = temp.path().join("runtime");
    let id = format!("agent_hub:{}", uuid::Uuid::new_v4());
    let python = python_runtime().unwrap();
    let mut draft = AutomationDraft {
    package_options: None,
        name: "Review".into(), provider: Provider::System,
        content: format!("{} './bundle/main.py'", render::shell(&python.to_string_lossy())),
        script_dir: Some(storage.to_string_lossy().into_owned()),
        workdir: Some(project.to_string_lossy().into_owned()),
        files: vec![AutomationScriptFile { path: "bundle/main.py".into(), content: "from pathlib import Path\nprint(Path.cwd())\nprint(Path(__file__).with_name('prompt.md').read_text().strip())".into() }, AutomationScriptFile { path: "bundle/prompt.md".into(), content: "review prompt".into() }],
        schedule: Schedule::Manual, enabled: false,
    };
    shell_entry::wrap(&mut draft, "sh");
    shell_entry::prepare(&mut draft, &id, None).unwrap();
    for (index, selected) in [&project, &second].into_iter().enumerate() {
        draft.workdir = Some(selected.to_string_lossy().into_owned());
        let wrapper = render::scripts(&runtime, &draft, &id, index == 0).unwrap();
        assert!(std::process::Command::new("/bin/sh")
            .arg(wrapper)
            .status()
            .unwrap()
            .success());
        let output = std::fs::read_to_string(runtime.join("output.log")).unwrap();
        assert!(
            output.contains(&selected.to_string_lossy().to_string()),
            "{output}"
        );
        assert!(output.contains("review prompt"));
        assert!(storage.join("bundle/main.py").is_file());
        assert_eq!(std::fs::read_dir(selected).unwrap().count(), 0);
    }
    let record = ManagedAutomation {
        id,
        revision: 1,
        draft: draft.clone(),
        source: "test".into(),
        identifier: "test".into(),
        location: String::new(),
    };
    assert_eq!(bundle_files::read(&record).unwrap(), draft.files);
}
