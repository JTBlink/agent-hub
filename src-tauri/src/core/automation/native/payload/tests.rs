use super::*;
use crate::core::automation::{Provider, Schedule};

fn draft(workspace: &Path) -> AutomationDraft {
    AutomationDraft {
        package_options: None,
        files: Vec::new(),
        name: "Cleanup".into(),
        description: None,
        provider: Provider::System,
        content: "printf original".into(),
        script_dir: None,
        workdir: Some(workspace.to_string_lossy().into_owned()),
        schedule: Schedule::Manual,
        enabled: true,
    }
}

#[test]
fn scripts_live_in_the_workspace_and_refresh_preserves_customizations() {
    let temp = tempfile::tempdir().unwrap();
    let draft = draft(temp.path());
    let first = format!("agent_hub:{}", uuid::Uuid::new_v4());
    let second = format!("agent_hub:{}", uuid::Uuid::new_v4());
    let runtime = temp.path().join("runtime");
    let path = write(&runtime, &draft, &first, true).unwrap();
    assert_eq!(path.parent(), Some(temp.path()));
    fs::write(&path, "printf customized").unwrap();
    write(&runtime, &draft, &first, false).unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), "printf customized");
    assert_ne!(path, write(&runtime, &draft, &second, true).unwrap());
    assert!(!runtime.exists());
}

#[test]
fn refuses_unmanaged_files_and_invalid_task_ids() {
    let temp = tempfile::tempdir().unwrap();
    let draft = draft(temp.path());
    let id = format!("agent_hub:{}", uuid::Uuid::new_v4());
    let runtime = temp.path().join("runtime");
    let path = path(&runtime, &draft, &id).unwrap();
    fs::write(&path, "preserve user content").unwrap();
    assert!(write(&runtime, &draft, &id, true).is_err());
    assert_eq!(fs::read_to_string(path).unwrap(), "preserve user content");
    assert!(write(&runtime, &draft, "../outside", true).is_err());
}

#[cfg(unix)]
#[test]
fn refuses_script_symlinks_without_modifying_their_targets() {
    let temp = tempfile::tempdir().unwrap();
    let draft = draft(temp.path());
    let id = format!("agent_hub:{}", uuid::Uuid::new_v4());
    let runtime = temp.path().join("runtime");
    let outside = temp.path().join("preserved.sh");
    fs::write(&outside, "keep").unwrap();
    std::os::unix::fs::symlink(&outside, path(&runtime, &draft, &id).unwrap()).unwrap();
    assert!(write(&runtime, &draft, &id, false).is_err());
    assert_eq!(fs::read_to_string(outside).unwrap(), "keep");
}
