//! Materialize only the template's declared scripts, preserving customized files.
use super::super::{store, AutomationDraft, AutomationScriptFile, ManagedAutomation};
use super::payload::{header, read_file_with_limit};

fn read_file(path: &Path) -> Result<Option<String>, String> {
    read_file_with_limit(
        path,
        (super::super::definition::MAX_TASK_BYTES + 256) as u64,
    )
}
use std::{
    fs,
    path::{Path, PathBuf},
};

pub(in crate::core::automation) fn path(
    workdir: &str,
    relative: &str,
    create: bool,
) -> Result<PathBuf, String> {
    crate::core::path_guard::ensure_safe_skill_relative_path(relative)
        .map_err(|e| e.to_string())?;
    if relative.contains(['\\', ':']) {
        return Err("Invalid template script path".into());
    }
    let root = Path::new(workdir);
    if !root.is_absolute() || !root.is_dir() {
        return Err("Template scripts require an existing absolute working directory".into());
    }
    let path = root.join(relative);
    let mut parent = root.to_path_buf();
    let parts: Vec<_> = Path::new(relative).components().collect();
    for component in &parts[..parts.len().saturating_sub(1)] {
        parent.push(component);
        match fs::symlink_metadata(&parent) {
            Ok(metadata) => {
                #[cfg(windows)]
                {
                    use std::os::windows::fs::MetadataExt;
                    if metadata.file_attributes() & 0x400 != 0 {
                        return Err(
                            "Template script directories cannot be links or junctions".into()
                        );
                    }
                }
                if !metadata.is_dir() || metadata.file_type().is_symlink() {
                    return Err("Template script directories cannot be links".into());
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                if create {
                    fs::create_dir(&parent).map_err(|e| e.to_string())?;
                }
            }
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(path)
}

pub(super) fn write(
    dir: &Path,
    draft: &AutomationDraft,
    id: &str,
    replace: bool,
) -> Result<(), String> {
    if draft.files.is_empty() {
        return Ok(());
    }
    let workspace = draft
        .scripts_dir()
        .ok_or("Template scripts require a task working directory")?;
    let old = store::load(dir.parent().ok_or("Missing automation directory")?)?
        .into_iter()
        .find(|record| record.id == id && record.draft.scripts_dir() == draft.scripts_dir());
    let package = old
        .as_ref()
        .is_some_and(|r| super::super::package::directory(r).is_some());
    for file in &draft.files {
        let path = path(workspace, &file.path, true)?;
        let previous = read_file(&path)?;
        let owned = old
            .as_ref()
            .is_some_and(|record| record.draft.files.iter().any(|old| old.path == file.path))
            || previous
                .as_ref()
                .is_some_and(|text| text.starts_with(&header(id)));
        if previous.is_some() && !owned {
            return Err(
                "Template script location is occupied; choose a separate working directory".into(),
            );
        }
        if previous.is_some() && !replace {
            continue;
        }
        let content = if package {
            file.content.clone()
        } else {
            format!(
                "{}{}{}",
                if file.path.ends_with(".ps1") {
                    "\u{feff}"
                } else {
                    ""
                },
                header(id),
                file.content
            )
        };
        if previous.as_deref() != Some(&content) {
            store::write(&path, content.as_bytes())?;
        }
    }
    Ok(())
}

pub(in crate::core::automation) fn read(
    record: &ManagedAutomation,
) -> Result<Vec<AutomationScriptFile>, String> {
    let mut files = record.draft.files.clone();
    for file in &mut files {
        let workspace = record
            .draft
            .scripts_dir()
            .ok_or("Missing template working directory")?;
        if let Some(content) = read_file(&path(workspace, &file.path, false)?)? {
            let content = content.trim_start_matches('﻿');
            file.content = content
                .strip_prefix(&header(&record.id))
                .unwrap_or(content)
                .to_owned();
        }
    }
    Ok(files)
}

#[cfg(all(test, unix))]
mod tests;
