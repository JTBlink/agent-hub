//! Materialize only the template's declared scripts, preserving customized files.
use super::super::{store, AutomationDraft, AutomationScriptFile, ManagedAutomation};
use super::payload::{header, read_file};
use std::{
    fs,
    path::{Path, PathBuf},
};

pub(super) fn path(workdir: &str, relative: &str, create: bool) -> Result<PathBuf, String> {
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
        .workdir
        .as_deref()
        .ok_or("Template scripts require a task working directory")?;
    let old = store::load(dir.parent().ok_or("Missing automation directory")?)?
        .into_iter()
        .find(|record| record.id == id && record.draft.workdir == draft.workdir);
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
        let content = format!(
            "{}{}{}",
            if file.path.ends_with(".ps1") {
                "\u{feff}"
            } else {
                ""
            },
            header(id),
            file.content
        );
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
            .workdir
            .as_deref()
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
mod tests {
    use super::*;
    use crate::core::automation::{Provider, Schedule};
    #[test]
    fn refuses_unmanaged_files_and_linked_template_directories() {
        let temp = tempfile::tempdir().unwrap();
        let runtime = temp
            .path()
            .join("runtime")
            .join(uuid::Uuid::new_v4().to_string());
        let workspace = temp.path().join("workspace");
        let outside = temp.path().join("outside");
        fs::create_dir_all(workspace.join("bundle")).unwrap();
        fs::create_dir(&outside).unwrap();
        let draft = AutomationDraft {
            name: "Template".into(),
            provider: Provider::System,
            content: "python3 bundle/main.py".into(),
            files: vec![AutomationScriptFile {
                path: "bundle/main.py".into(),
                content: "print('template')".into(),
            }],
            workdir: Some(workspace.to_string_lossy().into_owned()),
            schedule: Schedule::Manual,
            enabled: false,
        };
        let id = format!("agent_hub:{}", uuid::Uuid::new_v4());
        fs::write(workspace.join("bundle/main.py"), "preserve user script").unwrap();
        assert!(write(&runtime, &draft, &id, true).is_err());
        assert_eq!(
            fs::read_to_string(workspace.join("bundle/main.py")).unwrap(),
            "preserve user script"
        );
        fs::remove_file(workspace.join("bundle/main.py")).unwrap();
        fs::remove_dir(workspace.join("bundle")).unwrap();
        std::os::unix::fs::symlink(&outside, workspace.join("bundle")).unwrap();
        assert!(write(&runtime, &draft, &id, true).is_err());
        assert!(!outside.join("main.py").exists());
    }
}
