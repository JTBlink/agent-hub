use super::*;
use crate::core::automation::{AutomationScriptFile, Schedule};

fn draft(provider: Provider) -> AutomationDraft {
    AutomationDraft {
        package_options: None,
        name: "Example task".into(),
        description: None,
        provider,
        content: "do not execute".into(),
        workdir: None,
        script_dir: None,
        schedule: Schedule::Manual,
        enabled: false,
        files: vec![],
    }
}

#[test]
fn audits_all_repository_tasks_without_creating_state_or_registering_jobs() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let report = repository(root).unwrap();
    assert_eq!(report.tasks.len(), 10);
    assert!(report.is_clean(), "{report:?}");
    assert_eq!(
        report
            .tasks
            .iter()
            .filter(|task| matches!(task.mode, RuntimeMode::SharedAgent))
            .count(),
        6
    );
    assert_eq!(
        report
            .tasks
            .iter()
            .filter(|task| matches!(task.mode, RuntimeMode::Script))
            .count(),
        4
    );
    for task in report.tasks {
        assert!(!root.join(task.id).join(".local").exists());
    }
}

#[test]
fn reports_embedded_implementations_without_overwriting_custom_business_files() {
    let mut definition = draft(Provider::System);
    definition.files = vec![
        AutomationScriptFile {
            path: "config/agent.json".into(),
            content: "{}".into(),
        },
        AutomationScriptFile {
            path: "scripts/custom.py".into(),
            content: "def previous_agent(): pass\ndef wait_for_result(): pass".into(),
        },
        AutomationScriptFile {
            path: "scripts/task_state.py".into(),
            content: "class TaskState:\n def extension(self): pass".into(),
        },
    ];
    let saved = definition.clone();
    let report = inspect("example".into(), &definition);
    assert!(matches!(report.mode, RuntimeMode::UnverifiedAgent));
    assert_eq!(
        report
            .findings
            .iter()
            .map(|finding| finding.code)
            .collect::<Vec<_>>(),
        [
            "embedded_agent_runtime",
            "embedded_state_store",
            "agent_adapter_needs_review"
        ]
    );
    assert_eq!(definition, saved);
    assert!(inspect("native".into(), &draft(Provider::Hermes))
        .findings
        .is_empty());
}

#[test]
fn an_empty_directory_is_not_reported_as_a_successful_task_audit() {
    let root = tempfile::tempdir().unwrap();
    assert!(repository(root.path())
        .unwrap_err()
        .contains("No task packages"));
}

#[test]
fn generated_builtin_tasks_use_the_same_shared_runtime_contract() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let catalog = crate::core::automation::package::catalog::scan_portable(root).unwrap();
    let mut checked = 0;
    for entry in catalog.packages {
        let id = Path::new(&entry.path)
            .file_name()
            .unwrap()
            .to_str()
            .unwrap();
        if let Some(template) = crate::core::automation::template(id, Some("en")) {
            let report = inspect(id.into(), &template.draft);
            assert!(report.findings.is_empty(), "{report:?}");
            checked += 1;
        }
    }
    assert!(checked >= 3);
}

#[cfg(unix)]
#[test]
fn every_repository_shell_entry_resolves_its_package_and_forwards_literal_arguments() {
    use std::os::unix::fs::PermissionsExt;
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let catalog = crate::core::automation::package::catalog::scan_portable(root).unwrap();
    let sandbox = tempfile::tempdir().unwrap();
    let python = sandbox.path().join("fake python");
    std::fs::write(&python, "#!/bin/sh\nprintf '%s\\n' \"$AGENT_HUB_TASK_DIR\" \"$AGENT_HUB_SCRIPT_DIR\" \"$@\" > \"$TASK_ENTRY_TEST_OUTPUT\"\n").unwrap();
    std::fs::set_permissions(&python, std::fs::Permissions::from_mode(0o700)).unwrap();
    for (index, task) in catalog.packages.into_iter().enumerate() {
        let package = sandbox.path().join(format!("task {index}"));
        std::fs::create_dir_all(package.join("scripts")).unwrap();
        let entry = package.join("scripts/run.sh");
        let body = task
            .package
            .draft
            .files
            .iter()
            .find(|file| file.path == "scripts/run.sh")
            .unwrap();
        std::fs::write(&entry, &body.content).unwrap();
        let output = package.join("observed");
        let status = std::process::Command::new("/bin/sh")
            .arg(&entry)
            .args(["--dry-run", "literal $(touch NEVER)"])
            .current_dir(sandbox.path())
            .env_remove("AGENT_HUB_TASK_DIR")
            .env_remove("AGENT_HUB_SCRIPT_DIR")
            .env("AGENT_HUB_PYTHON", &python)
            .env("TASK_ENTRY_TEST_OUTPUT", &output)
            .status()
            .unwrap();
        assert!(status.success(), "{}", task.path);
        let observed = std::fs::read_to_string(output).unwrap();
        let lines: Vec<_> = observed.lines().collect();
        assert_eq!(
            Path::new(lines[0]).canonicalize().unwrap(),
            package.canonicalize().unwrap()
        );
        assert_eq!(lines[1], lines[0]);
        let catalog: serde_json::Value = serde_json::from_slice(
            &std::fs::read(root.join(&task.path).join("config/catalog.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(
            Path::new(lines[2]),
            Path::new(lines[0]).join(catalog["entrypoint"].as_str().unwrap())
        );
        assert_eq!(&lines[3..], ["--dry-run", "literal $(touch NEVER)"]);
        assert!(!sandbox.path().join("NEVER").exists());
    }
}
