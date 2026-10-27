//! Omitted working directories get an isolated task workspace. Merely listing
//! tasks does not create directories, and explicit directories are preserved.
use super::{
    definition::{valid_id, AutomationDraft},
    store,
};
use std::path::{Path, PathBuf};

pub(super) fn ensure(draft: &mut AutomationDraft, id: &str, scope: &str) -> Result<(), String> {
    let root = workspace_root();
    ensure_at(&root, draft, id, scope)
}

pub(super) fn workspace_root() -> PathBuf {
    if std::env::var_os("AGENT_HUB_AUTOMATION_HOME").is_some() {
        store::root().join("workspaces")
    } else {
        super::super::central_repo::home_base_dir().join("automations")
    }
}

pub(super) fn is_default(value: &str, id: &str) -> bool {
    Path::new(value) == path(&workspace_root(), id, "")
}

fn path(root: &Path, id: &str, scope: &str) -> PathBuf {
    let key = if valid_id(id) {
        id.trim_start_matches("agent_hub:").to_string()
    } else {
        // External Hermes IDs may contain separators and share IDs across
        // profiles. Bind the workspace to the exact task and source location.
        use sha2::{Digest, Sha256};
        format!("{:x}", Sha256::digest(format!("{id}\0{scope}")))
    };
    root.join(key).join("workspace")
}

fn ensure_at(
    root: &Path,
    draft: &mut AutomationDraft,
    id: &str,
    scope: &str,
) -> Result<(), String> {
    if draft.workdir.is_some() {
        return Ok(());
    }
    let directory = path(root, id, scope);
    std::fs::create_dir_all(&directory)
        .map_err(|e| format!("Cannot create automation workspace: {e}"))?;
    super::super::path_guard::ensure_dir_within_root(&directory, root)
        .map_err(|e| e.to_string())?;
    draft.workdir = Some(directory.to_string_lossy().into_owned());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn draft() -> AutomationDraft {
        AutomationDraft {
            files: Vec::new(),
            name: "Audit".into(),
            provider: super::super::Provider::System,
            content: "exit 0".into(),
            workdir: None,
            schedule: super::super::Schedule::Manual,
            enabled: true,
        }
    }
    #[test]
    fn omitted_directories_create_separate_reusable_workspaces_without_running_commands() {
        let temporary = tempfile::tempdir().unwrap();
        let id = format!("agent_hub:{}", uuid::Uuid::new_v4());
        let mut first = draft();
        ensure_at(temporary.path(), &mut first, &id, "").unwrap();
        let first_path = Path::new(first.workdir.as_ref().unwrap());
        assert!(first_path.is_dir());
        assert_eq!(first_path.file_name().unwrap(), "workspace");
        std::fs::write(first_path.join("result.txt"), "keep").unwrap();
        let mut same = draft();
        ensure_at(temporary.path(), &mut same, &id, "").unwrap();
        assert_eq!(first.workdir, same.workdir);
        assert_eq!(
            std::fs::read_to_string(first_path.join("result.txt")).unwrap(),
            "keep"
        );
        let mut second = draft();
        ensure_at(
            temporary.path(),
            &mut second,
            "hermes:profile:../../id",
            "profile/jobs.json",
        )
        .unwrap();
        assert_ne!(first.workdir, second.workdir);
        assert!(Path::new(second.workdir.as_ref().unwrap()).starts_with(temporary.path()));
    }
    #[test]
    fn explicit_directories_are_preserved_and_do_not_create_default_folders() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().join("unused");
        let mut draft = draft();
        draft.workdir = Some(temporary.path().to_string_lossy().into_owned());
        ensure_at(&root, &mut draft, "id", "scope").unwrap();
        assert!(!root.exists());
        assert_eq!(draft.workdir.as_deref(), temporary.path().to_str());
        assert_ne!(path(&root, "same", "first"), path(&root, "same", "second"));
    }
}
