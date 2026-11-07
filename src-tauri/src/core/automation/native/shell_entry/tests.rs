use super::*;
use crate::core::automation::{Provider, Schedule};
fn draft(workspace: &Path) -> AutomationDraft {
    AutomationDraft {
        package_options: None,
        name: "Audit".into(),
        provider: Provider::System,
        content: "printf original".into(),
        script_dir: None,
        workdir: Some(workspace.to_string_lossy().into_owned()),
        schedule: Schedule::Manual,
        enabled: false,
        files: Vec::new(),
    }
}

#[test]
fn short_entries_preserve_commands_and_avoid_overwriting_shared_workspaces() {
    let temp = tempfile::tempdir().unwrap();
    let id = format!("agent_hub:{}", uuid::Uuid::new_v4());
    let mut task = draft(temp.path());
    let extension = if cfg!(windows) { "ps1" } else { "sh" };
    std::fs::write(temp.path().join(format!("run.{extension}")), "user file").unwrap();
    assert!(prepare(&mut task, &id, None).unwrap());
    assert_eq!(entry(&task).unwrap().path, format!("run-2.{extension}"));
    assert_eq!(entry(&task).unwrap().content, "printf original");
    let runtime = temp.path().join("runtime");
    let script = super::super::payload::write(&runtime, &task, &id, true).unwrap();
    assert!(script.ends_with(format!("run-2.{extension}")));
    assert!(!prepare(&mut task, &id, None).unwrap());
    let mut second = draft(temp.path());
    prepare(
        &mut second,
        &format!("agent_hub:{}", uuid::Uuid::new_v4()),
        None,
    )
    .unwrap();
    assert_eq!(entry(&second).unwrap().path, format!("run-3.{extension}"));
    assert_eq!(
        std::fs::read_to_string(temp.path().join(format!("run.{extension}"))).unwrap(),
        "user file"
    );
}

#[test]
fn legacy_bodies_are_archived_only_after_the_short_entry_has_been_materialized() {
    let temp = tempfile::tempdir().unwrap();
    let id = format!("agent_hub:{}", uuid::Uuid::new_v4());
    let mut task = draft(temp.path());
    let runtime = temp.path().join("runtime");
    let legacy = super::super::payload::write(&runtime, &task, &id, true).unwrap();
    prepare(&mut task, &id, None).unwrap();
    let short = super::super::payload::write(&runtime, &task, &id, true).unwrap();
    assert!(legacy.exists() && short.exists());
    super::super::payload::archive_legacy(&runtime, &task, &id).unwrap();
    assert!(!legacy.exists());
    assert!(short.exists());
    let extension = if cfg!(windows) { "ps1" } else { "sh" };
    assert!(
        std::fs::read_to_string(runtime.join(format!("previous-command.{extension}")))
            .unwrap()
            .contains("printf original")
    );
}

#[cfg(unix)]
#[test]
fn scheduled_wrapper_invokes_the_same_short_shell_entry_and_preserves_python_exit_status() {
    let temp = tempfile::tempdir().unwrap();
    let workspace = temp.path().join("workspace");
    std::fs::create_dir(&workspace).unwrap();
    let runtime = temp.path().join("runtime");
    let mut task = draft(&workspace);
    let python = super::super::python_runtime().unwrap();
    task.content = format!(
        "{} './main.py'",
        super::super::render::shell(&python.to_string_lossy())
    );
    task.files.push(AutomationScriptFile {
        path: "main.py".into(),
        content: "print('shell-entry-output')\nraise SystemExit(17)\n".into(),
    });
    wrap(&mut task, "sh");
    assert_eq!(task.content, "sh './run.sh'");
    let id = format!("agent_hub:{}", uuid::Uuid::new_v4());
    let wrapper = super::super::render::scripts(&runtime, &task, &id, true).unwrap();
    let script = std::fs::read_to_string(&wrapper).unwrap();
    assert!(script.contains(&format!(
        "/bin/sh {}",
        super::super::render::shell(&workspace.join("run.sh").to_string_lossy())
    )));
    let status = std::process::Command::new("/bin/sh")
        .arg(wrapper)
        .status()
        .unwrap();
    assert_eq!(status.code(), Some(17));
    assert_eq!(
        std::fs::read_to_string(runtime.join("exit"))
            .unwrap()
            .trim(),
        "17"
    );
    assert!(std::fs::read_to_string(runtime.join("output.log"))
        .unwrap()
        .contains("shell-entry-output"));
    assert!(!workspace
        .join(format!(
            "agent-hub-{}.sh",
            id.trim_start_matches("agent_hub:")
        ))
        .exists());
}

#[cfg(unix)]
#[test]
fn generated_python_launcher_runs_from_an_unrelated_directory_and_forwards_arguments() {
    let root = tempfile::tempdir().unwrap();
    let scripts = root.path().join("task with spaces/scripts");
    std::fs::create_dir_all(&scripts).unwrap();
    std::fs::write(
        scripts.join("main.py"),
        "import sys\nprint(sys.argv[1])\nraise SystemExit(17)\n",
    )
    .unwrap();
    let mut definition = draft(root.path());
    let python = super::super::python_runtime().unwrap();
    definition.content = format!(
        "{} \"$AGENT_HUB_SCRIPT_DIR/scripts/main.py\"",
        super::super::render::shell(&python.to_string_lossy())
    );
    wrap(&mut definition, "sh");
    let entry = scripts.join("run.sh");
    std::fs::write(&entry, &definition.files.last().unwrap().content).unwrap();
    let output = std::process::Command::new("/bin/sh")
        .arg(entry)
        .arg("literal $(touch NEVER)")
        .env_remove("AGENT_HUB_TASK_DIR")
        .env_remove("AGENT_HUB_SCRIPT_DIR")
        .current_dir(root.path())
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(17));
    assert_eq!(
        String::from_utf8_lossy(&output.stdout).trim(),
        "literal $(touch NEVER)"
    );
    assert!(!root.path().join("NEVER").exists());
}
