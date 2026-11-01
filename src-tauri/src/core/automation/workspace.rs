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

pub(super) fn ensure_scripts(draft: &mut AutomationDraft, id: &str) -> Result<(), String> {
    let mut storage = draft.clone();
    storage.workdir = draft.script_dir.clone();
    ensure(&mut storage, id, "")?;
    draft.script_dir = storage.workdir;
    Ok(())
}

/// Old native tasks used their execution directory to store scripts as well.
pub(super) fn separate(draft: &mut AutomationDraft, id: &str) {
    if draft.provider == super::Provider::System && draft.script_dir.is_none() {
        draft.script_dir = draft.workdir.clone();
        if draft
            .workdir
            .as_deref()
            .is_some_and(|path| is_default(path, id))
        {
            draft.workdir = None;
        }
    }
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
        .scripts_dir()
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

/// Portable task-directory spelling, shared by local allocation and backups.
pub(super) fn directory_name(name: &str) -> String {
    let source = super::templates::directory_slug(name).unwrap_or_else(|| name.into());
    let mut name = String::new();
    let mut separator = false;
    for ch in source.chars() {
        if ch.is_ascii_alphanumeric() || ch == '.' {
            if separator && !name.is_empty() {
                name.push('-');
            }
            name.push(ch.to_ascii_lowercase());
            separator = false;
        } else {
            separator = true;
        }
    }
    let name = name.trim_matches(['.', '-']);
    let name = super::super::path_guard::sanitize_name(if name.is_empty() { "task" } else { name });
    // Windows device names are reserved even with extensions. Use the same
    // portable spelling on every platform, including for restored tasks.
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ["COM", "LPT"].iter().any(|prefix| {
            stem.strip_prefix(prefix).is_some_and(|suffix| {
                matches!(
                    suffix,
                    "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
                )
            })
        })
    {
        format!("task-{name}")
    } else {
        name
    }
}

pub(super) fn allocate(root: &Path, name: &str) -> Result<PathBuf, String> {
    let name = directory_name(name);
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
mod tests;
