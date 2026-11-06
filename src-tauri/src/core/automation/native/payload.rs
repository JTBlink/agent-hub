//! Each task owns a script in its working directory; refreshes preserve edits.
use super::super::{definition::valid_id, store, AutomationDraft, ManagedAutomation};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

const MAX_SCRIPT_BYTES: u64 = 65536 + 256;

pub(super) fn header(id: &str) -> String {
    format!("# AgentHub automation script: {id}\n")
}

pub(super) fn path(dir: &Path, draft: &AutomationDraft, id: &str) -> Result<PathBuf, String> {
    if !valid_id(id) {
        return Err("Invalid automation script ID".into());
    }
    if let Some(entry) = super::shell_entry::entry(draft) {
        let workspace = draft.scripts_dir().ok_or("Missing automation workspace")?;
        return super::bundle_files::path(workspace, &entry.path, false);
    }
    let extension = if cfg!(windows) { "ps1" } else { "sh" };
    match draft.scripts_dir() {
        Some(workdir) => {
            let workspace = Path::new(workdir);
            if !workspace.is_absolute() || !workspace.is_dir() {
                return Err(
                    "Automation script requires an existing absolute working directory".into(),
                );
            }
            Ok(workspace.join(format!(
                "agent-hub-{}.{}",
                id.trim_start_matches("agent_hub:"),
                extension
            )))
        }
        // Definitions created before isolated workspaces keep their old path.
        None => Ok(dir.join(format!("command.{extension}"))),
    }
}

pub(super) fn read_file(path: &Path) -> Result<Option<String>, String> {
    read_file_with_limit(path, MAX_SCRIPT_BYTES)
}

pub(super) fn read_file_with_limit(path: &Path, limit: u64) -> Result<Option<String>, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Cannot inspect automation script: {error}")),
    };
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err("Automation script must not be a symbolic link or junction".into());
        }
    }
    if !metadata.is_file() || metadata.len() > limit {
        return Err(format!(
            "Automation file must be a regular file no larger than {limit} bytes"
        ));
    }
    let mut content = String::new();
    fs::File::open(path)
        .map_err(|error| error.to_string())?
        .take(limit + 1)
        .read_to_string(&mut content)
        .map_err(|error| format!("Cannot read automation script: {error}"))?;
    if content.len() as u64 > limit {
        return Err("Automation file exceeds its size limit".into());
    }
    Ok(Some(content))
}

pub(in crate::core::automation) fn write(
    dir: &Path,
    draft: &AutomationDraft,
    id: &str,
    replace: bool,
) -> Result<PathBuf, String> {
    if super::shell_entry::entry(draft).is_some() {
        super::bundle_files::write(dir, draft, id, replace)?;
        return path(dir, draft, id);
    }
    let path = path(dir, draft, id)?;
    let previous = read_file(&path)?;
    if previous.is_some() && !replace {
        super::bundle_files::write(dir, draft, id, replace)?;
        return Ok(path);
    }
    let marker = header(id);
    if let Some(previous) = &previous {
        let owned = draft.scripts_dir().is_none()
            || previous.trim_start_matches('\u{feff}').starts_with(&marker)
            || store::load(dir.parent().ok_or("Missing automation storage directory")?)?
                .iter()
                .any(|record| record.id == id && record.draft.scripts_dir() == draft.scripts_dir());
        if !owned {
            return Err("Automation script path is occupied by an unmanaged file; choose another working directory".into());
        }
    }
    let content = format!(
        "{}{marker}{}",
        if cfg!(windows) { "\u{feff}" } else { "" },
        draft.content
    );
    if previous.as_deref() != Some(&content) {
        store::write(&path, content.as_bytes())?;
    }
    super::bundle_files::write(dir, draft, id, replace)?;
    Ok(path)
}

pub(in crate::core::automation) fn read(
    root: &Path,
    record: &ManagedAutomation,
) -> Result<Option<String>, String> {
    if super::shell_entry::entry(&record.draft).is_some() {
        return Ok(None);
    }
    if record.draft.scripts_dir().is_none() {
        return Ok(None);
    }
    let path = path(&super::directory(root, record), &record.draft, &record.id)?;
    Ok(read_file(&path)?.map(|text| {
        let text = text.trim_start_matches('\u{feff}');
        text.strip_prefix(&header(&record.id))
            .unwrap_or(text)
            .to_owned()
    }))
}

/// Called after the new runner and its definition are durable. Retain the old
/// body in internal data before removing its long filename from the workspace.
pub(in crate::core::automation) fn archive_legacy(
    dir: &Path,
    draft: &AutomationDraft,
    id: &str,
) -> Result<(), String> {
    let Some(entry) = super::shell_entry::entry(draft) else {
        return Ok(());
    };
    if !valid_id(id) {
        return Err("Invalid automation script ID".into());
    }
    let Some(workspace) = draft.scripts_dir() else {
        return Ok(());
    };
    let extension = if cfg!(windows) { "ps1" } else { "sh" };
    let old = Path::new(workspace).join(format!(
        "agent-hub-{}.{}",
        id.trim_start_matches("agent_hub:"),
        extension
    ));
    let Some(text) = read_file(&old)? else {
        return Ok(());
    };
    let body = text.trim_start_matches('\u{feff}');
    if body.strip_prefix(&header(id)).unwrap_or(body) != entry.content {
        return Err("Legacy automation script changed; its file was preserved".into());
    }
    let archive = dir.join(format!("previous-command.{extension}"));
    match read_file(&archive)? {
        Some(previous) if previous != text => {
            return Err(
                "Previous automation script archive is occupied; legacy file was preserved".into(),
            )
        }
        Some(_) => {}
        None => store::write(&archive, text.as_bytes())?,
    }
    if read_file(&old)?.as_deref() == Some(&text) {
        fs::remove_file(old).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests;
