//! Human-readable default workspaces; ownership stays in internal task data.
//! Listing tasks never creates directories; explicit and legacy paths survive.
use super::{
    definition::{valid_id, AutomationDraft},
    store,
};
use std::path::{Path, PathBuf};

pub(super) fn ensure(draft: &mut AutomationDraft, id: &str, scope: &str) -> Result<(), String> {
    let root = workspace_root();
    ensure_at(&root, &store::root(), draft, id, scope)
}

pub(super) fn workspace_root() -> PathBuf {
    if std::env::var_os("AGENT_HUB_AUTOMATION_HOME").is_some() {
        store::root().join("workspaces")
    } else {
        super::super::central_repo::home_base_dir().join("automations")
    }
}

pub(super) fn is_default(value: &str, id: &str) -> bool {
    is_default_at(&workspace_root(), &store::root(), value, id)
}

/// Ownership comes from the allocation record or the exact legacy task path.
pub(super) fn owned_directories_at(
    root: &Path,
    state: &Path,
    record: &super::ManagedAutomation,
) -> Result<Vec<PathBuf>, String> {
    let mut directories: Vec<_> = assigned(root, state, &record.id, &record.location)?
        .into_iter()
        .collect();
    let legacy = root.join(key(&record.id, ""));
    if record
        .draft
        .workdir
        .as_deref()
        .is_some_and(|path| Path::new(path) == legacy.join("workspace"))
    {
        directories.push(legacy);
    }
    Ok(directories)
}

fn key(id: &str, scope: &str) -> String {
    if valid_id(id) {
        id.trim_start_matches("agent_hub:").to_string()
    } else {
        // External Hermes IDs may contain separators and share IDs across
        // profiles. Bind the workspace to the exact task and source location.
        use sha2::{Digest, Sha256};
        format!("{:x}", Sha256::digest(format!("{id}\0{scope}")))
    }
}

fn is_default_at(root: &Path, state: &Path, value: &str, id: &str) -> bool {
    let path = Path::new(value);
    path == root.join(key(id, "")).join("workspace")
        || assigned(root, state, id, "").is_ok_and(|owned| owned.as_deref() == Some(path))
}

fn assignment(state: &Path, id: &str, scope: &str) -> PathBuf {
    state.join(key(id, scope)).join("workspace-name.json")
}

fn assigned(root: &Path, state: &Path, id: &str, scope: &str) -> Result<Option<PathBuf>, String> {
    use std::io::Read;
    let record = assignment(state, id, scope);
    for path in [
        state,
        record.parent().ok_or("Missing assignment parent")?,
        &record,
    ] {
        match std::fs::symlink_metadata(path) {
            Ok(metadata) if super::super::path_guard::is_link_or_reparse_point(&metadata) => {
                return Err(
                    "Automation workspace ownership records cannot be links or junctions".into(),
                );
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(format!("Cannot inspect workspace ownership: {error}")),
        }
    }
    let file = match std::fs::File::open(record) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("Cannot read automation workspace assignment: {e}")),
    };
    let mut bytes = Vec::new();
    file.take(4096)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    let name: String = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    let path = root.join(&name);
    super::super::path_guard::ensure_safe_skill_relative_path(&name).map_err(|e| e.to_string())?;
    if path.parent() != Some(root) || name.contains(['/', '\\']) {
        return Err("Invalid automation workspace assignment".into());
    }
    Ok(Some(path))
}

fn check_directory(directory: &Path, root: &Path) -> Result<(), String> {
    let linked = std::fs::symlink_metadata(directory)
        .map(|metadata| super::super::path_guard::is_link_or_reparse_point(&metadata))
        .map_err(|error| error.to_string())?;
    if linked || !super::super::path_guard::is_path_safe(root, directory) {
        return Err("Automation workspace must be a directory inside its managed root".into());
    }
    Ok(())
}

fn ensure_at(
    root: &Path,
    state: &Path,
    draft: &mut AutomationDraft,
    id: &str,
    scope: &str,
) -> Result<(), String> {
    if draft.workdir.is_some() {
        return Ok(());
    }
    std::fs::create_dir_all(root)
        .map_err(|e| format!("Cannot create automation workspace: {e}"))?;
    if let Some(directory) = assigned(root, state, id, scope)? {
        if !directory.is_dir() {
            return Err(
                "Automation workspace was moved or removed; specify its current working directory"
                    .into(),
            );
        }
        check_directory(&directory, root)?;
        draft.workdir = Some(directory.to_string_lossy().into_owned());
        return Ok(());
    }
    let directory = allocate(root, &draft.name)?;
    check_directory(&directory, root)?;
    let name = directory
        .file_name()
        .ok_or("Missing workspace name")?
        .to_string_lossy();
    let bytes = serde_json::to_vec(name.as_ref()).map_err(|e| e.to_string())?;
    store::write(&assignment(state, id, scope), &bytes)?;
    draft.workdir = Some(directory.to_string_lossy().into_owned());
    Ok(())
}

fn allocate(root: &Path, name: &str) -> Result<PathBuf, String> {
    let name = super::super::path_guard::sanitize_name(name);
    // Windows device names are reserved even with extensions. Use the same
    // portable spelling on every platform, including for restored tasks.
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    let name = if matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ["COM", "LPT"].iter().any(|prefix| {
            stem.strip_prefix(prefix).is_some_and(|suffix| {
                matches!(
                    suffix,
                    "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
                )
            })
        }) {
        format!("task-{name}")
    } else {
        name
    };
    (1..=10000)
        .find_map(|number| {
            let candidate = root.join(if number == 1 {
                name.clone()
            } else {
                format!("{name}-{number}")
            });
            match std::fs::create_dir(&candidate) {
                Ok(()) => Some(Ok(candidate)),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => None,
                Err(e) => Some(Err(format!("Cannot create automation workspace: {e}"))),
            }
        })
        .ok_or_else(|| "Too many automation workspaces with the same name".to_string())?
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
        let state = temporary.path().join("state");
        let root = temporary.path().join("workspaces");
        let id = format!("agent_hub:{}", uuid::Uuid::new_v4());
        let mut first = draft();
        ensure_at(&root, &state, &mut first, &id, "").unwrap();
        let first_path = Path::new(first.workdir.as_ref().unwrap());
        assert!(first_path.is_dir());
        assert_eq!(first_path.file_name().unwrap(), "Audit");
        assert!(!first_path
            .to_string_lossy()
            .contains(id.trim_start_matches("agent_hub:")));
        std::fs::write(first_path.join("result.txt"), "keep").unwrap();
        let mut same = draft();
        same.name = "Renamed".into();
        ensure_at(&root, &state, &mut same, &id, "").unwrap();
        assert_eq!(first.workdir, same.workdir);
        assert_eq!(
            std::fs::read_to_string(first_path.join("result.txt")).unwrap(),
            "keep"
        );
        let mut second = draft();
        ensure_at(
            &root,
            &state,
            &mut second,
            "hermes:profile:../../id",
            "profile/jobs.json",
        )
        .unwrap();
        assert_ne!(first.workdir, second.workdir);
        assert_eq!(
            Path::new(second.workdir.as_ref().unwrap())
                .file_name()
                .unwrap(),
            "Audit-2"
        );
        assert!(is_default_at(
            &root,
            &state,
            first.workdir.as_deref().unwrap(),
            &id
        ));
        assert!(!is_default_at(
            &root,
            &state,
            second.workdir.as_deref().unwrap(),
            &id
        ));
        assert!(is_default_at(
            &root,
            &state,
            root.join(key(&id, "")).join("workspace").to_str().unwrap(),
            &id
        ));
    }
    #[test]
    fn explicit_directories_are_preserved_and_do_not_create_default_folders() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().join("unused");
        let mut draft = draft();
        draft.workdir = Some(temporary.path().to_string_lossy().into_owned());
        ensure_at(
            &root,
            &temporary.path().join("state"),
            &mut draft,
            "id",
            "scope",
        )
        .unwrap();
        assert!(!root.exists());
        assert_eq!(draft.workdir.as_deref(), temporary.path().to_str());
        assert_ne!(key("same", "first"), key("same", "second"));
    }

    #[test]
    fn occupied_names_and_unsafe_task_names_do_not_overwrite_existing_files() {
        let temp = tempfile::tempdir().unwrap();
        let state = temp.path().join("state");
        let root = temp.path().join("workspaces");
        std::fs::create_dir_all(root.join("Audit")).unwrap();
        std::fs::write(root.join("Audit/keep.txt"), "keep").unwrap();
        let mut task = draft();
        ensure_at(&root, &state, &mut task, "first", "").unwrap();
        assert_eq!(task.workdir.as_deref(), root.join("Audit-2").to_str());
        assert_eq!(
            std::fs::read_to_string(root.join("Audit/keep.txt")).unwrap(),
            "keep"
        );
        let mut task = draft();
        task.name = "../../磁盘/清理".into();
        ensure_at(&root, &state, &mut task, "second", "").unwrap();
        let path = Path::new(task.workdir.as_deref().unwrap());
        assert_eq!(path.parent(), Some(root.as_path()));
        assert_eq!(path.file_name().unwrap(), "磁盘清理");
        assert_eq!(
            allocate(&root, "con.txt").unwrap(),
            root.join("task-con.txt")
        );
    }

    #[test]
    fn missing_or_invalid_assignments_require_repair_instead_of_silently_replacing_data() {
        let temp = tempfile::tempdir().unwrap();
        let state = temp.path().join("state");
        let root = temp.path().join("workspaces");
        let mut task = draft();
        ensure_at(&root, &state, &mut task, "first", "").unwrap();
        std::fs::remove_dir(task.workdir.unwrap()).unwrap();
        assert!(ensure_at(&root, &state, &mut draft(), "first", "").is_err());
        for name in [
            "..",
            ".",
            "../outside",
            "nested/directory",
            "nested\\directory",
        ] {
            store::write(
                &assignment(&state, "second", ""),
                &serde_json::to_vec(name).unwrap(),
            )
            .unwrap();
            assert!(ensure_at(&root, &state, &mut draft(), "second", "").is_err());
        }
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_names_are_not_adopted_or_reused() {
        let temp = tempfile::tempdir().unwrap();
        let state = temp.path().join("state");
        let root = temp.path().join("workspaces");
        let outside = temp.path().join("outside");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, root.join("Audit")).unwrap();
        let mut task = draft();
        ensure_at(&root, &state, &mut task, "first", "").unwrap();
        assert_eq!(task.workdir.as_deref(), root.join("Audit-2").to_str());
        std::fs::remove_dir(root.join("Audit-2")).unwrap();
        std::os::unix::fs::symlink(&outside, root.join("Audit-2")).unwrap();
        assert!(ensure_at(&root, &state, &mut draft(), "first", "").is_err());
        assert!(std::fs::read_dir(&outside).unwrap().next().is_none());
    }
}
