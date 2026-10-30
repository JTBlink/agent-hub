//! Persist the scheduled shell entry as an ordinary, editable workspace file.
use super::super::{AutomationDraft, AutomationScriptFile, ManagedAutomation};
use std::path::Path;

pub(in crate::core::automation) fn command(path: &str) -> String {
    if path.ends_with(".ps1") {
        format!("& {}", super::render::ps(&format!("./{path}")))
    } else {
        format!("sh {}", super::render::shell(&format!("./{path}")))
    }
}

pub(in crate::core::automation) fn entry(draft: &AutomationDraft) -> Option<&AutomationScriptFile> {
    draft.files.iter().find(|file| {
        (file.path.ends_with(".sh") || file.path.ends_with(".ps1"))
            && draft.content == command(&file.path)
    })
}

pub(in crate::core::automation) fn wrap(draft: &mut AutomationDraft, shell: &str) {
    let path = if shell == "powershell" {
        "run.ps1"
    } else {
        "run.sh"
    };
    let content = std::mem::replace(&mut draft.content, command(path));
    draft.files.push(AutomationScriptFile {
        path: path.into(),
        content,
    });
}

pub(in crate::core::automation) fn prepare(
    draft: &mut AutomationDraft,
    id: &str,
    old: Option<&ManagedAutomation>,
) -> Result<bool, String> {
    let paths_changed = draft.script_dir.is_some() && make_bundle_paths_absolute(draft);
    let workspace = Path::new(draft.scripts_dir().ok_or("Missing automation workspace")?);
    let current = entry(draft).cloned();
    if current
        .as_ref()
        .is_some_and(|file| available(workspace, &file.path, id, old))
    {
        return Ok(paths_changed);
    }
    let old_entry = old
        .filter(|old| old.draft.scripts_dir() == draft.scripts_dir())
        .and_then(|old| entry(&old.draft))
        .filter(|file| available(workspace, &file.path, id, old));
    let path = if let Some(file) = old_entry {
        file.path.clone()
    } else {
        let extension = if cfg!(windows) { "ps1" } else { "sh" };
        (1..=10000)
            .map(|number| {
                if number == 1 {
                    format!("run.{extension}")
                } else {
                    format!("run-{number}.{extension}")
                }
            })
            .find(|path| {
                !draft.files.iter().any(|file| file.path == *path)
                    && available(workspace, path, id, old)
            })
            .ok_or("Too many automation scripts in the selected working directory")?
    };
    let content = current
        .as_ref()
        .or_else(|| old_entry.filter(|file| draft.content == command(&file.path)))
        .map_or_else(|| draft.content.clone(), |file| file.content.clone());
    if let Some(current) = current {
        draft.files.retain(|file| file.path != current.path);
    }
    if let Some(file) = draft.files.iter_mut().find(|file| file.path == path) {
        file.content = content;
    } else {
        draft.files.push(AutomationScriptFile {
            path: path.clone(),
            content,
        });
    }
    draft.content = command(&path);
    if draft.script_dir.is_some() {
        make_bundle_paths_absolute(draft);
    }
    Ok(true)
}

fn make_bundle_paths_absolute(draft: &mut AutomationDraft) -> bool {
    let paths: Vec<_> = draft.files.iter().map(|file| file.path.clone()).collect();
    let Some(entry) = entry(draft).map(|file| file.path.clone()) else {
        return false;
    };
    let Some(script) = draft.files.iter_mut().find(|file| file.path == entry) else {
        return false;
    };
    // Upgrade only the generated, single-command Python launcher; preserve custom scripts.
    if script.content.contains(['\n', '\r']) {
        return false;
    }
    for path in paths.iter().filter(|path| path.ends_with(".py")) {
        if let Some(prefix) = script.content.strip_suffix(&format!(" './{path}'")) {
            let root = if script.path.ends_with(".ps1") {
                "$env:AGENT_HUB_SCRIPT_DIR"
            } else {
                "$AGENT_HUB_SCRIPT_DIR"
            };
            script.content = format!("{prefix} \"{root}/{path}\"");
            return true;
        }
    }
    false
}

fn available(workspace: &Path, path: &str, id: &str, old: Option<&ManagedAutomation>) -> bool {
    let path_on_disk = workspace.join(path);
    if path_on_disk
        .symlink_metadata()
        .is_err_and(|error| error.kind() == std::io::ErrorKind::NotFound)
    {
        return true;
    }
    // A persisted file remains owned when its header has been edited out.
    super::payload::read_file(&path_on_disk).is_ok_and(|content| {
        content.is_some_and(|content| {
            content
                .trim_start_matches('\u{feff}')
                .starts_with(&super::payload::header(id))
        }) || old.is_some_and(|old| {
            old.draft
                .scripts_dir()
                .is_some_and(|dir| Path::new(dir) == workspace)
                && old.draft.files.iter().any(|file| file.path == path)
        })
    })
}

#[cfg(test)]
mod tests {
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
}
