//! Bounded provider output reads shared by latest output and local history.
use super::{hermes_manage, managed, native, store, Provider};
use crate::core::path_guard::is_path_safe;
use serde::Serialize;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};
const OUTPUT_LIMIT: u64 = 256 * 1024;
#[derive(Debug, Serialize)]
pub struct AutomationRunOutput {
    pub content: String,
    pub truncated: bool,
    /// No provider output exists yet; this is distinct from a failed read.
    pub available: bool,
    pub kind: String,
}
pub(super) fn checked(root: &Path, path: &Path) -> Result<(), String> {
    if !is_path_safe(root, path)
        || fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink())
    {
        return Err("Execution output is outside the task directory or is a symbolic link".into());
    }
    Ok(())
}
pub(super) fn hermes_outputs(root: &Path, id: &str) -> Result<Vec<PathBuf>, String> {
    if id.is_empty() || id == "." || id == ".." || id.contains(['/', '\\', ':']) {
        return Err("Invalid Hermes job ID".into());
    }
    let dir = root.join("cron/output").join(id);
    checked(root, &dir)?;
    let entries = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.to_string()),
    };
    let mut outputs = Vec::new();
    for (count, entry) in entries.enumerate() {
        if count >= 10000 {
            return Err("Too many Hermes output files".into());
        }
        let path = entry.map_err(|e| e.to_string())?.path();
        let valid = path
            .file_name()
            .and_then(|n| n.to_str())
            .and_then(|n| n.strip_suffix(".md"))
            .is_some_and(|n| chrono::NaiveDateTime::parse_from_str(n, "%Y-%m-%d_%H-%M-%S").is_ok());
        if !valid {
            continue;
        }
        checked(root, &path)?;
        if path.is_file() {
            outputs.push(path);
        }
    }
    outputs.sort_by(|a, b| b.cmp(a));
    Ok(outputs)
}
fn latest_hermes(root: &Path, id: &str) -> Result<Option<PathBuf>, String> {
    Ok(hermes_outputs(root, id)?.into_iter().next())
}
pub(super) fn native_directory(task: &super::AutomationTask) -> Result<Option<PathBuf>, String> {
    let root = store::root();
    let record = store::load(&root)?
        .into_iter()
        .find(|r| r.id == task.id && r.draft.provider == Provider::System);
    let Some(record) = record else {
        return Ok(None);
    };
    managed::verify(&root, &record)?;
    let dir = native::directory(&root, &record);
    checked(&root, &dir)?;
    Ok(Some(dir))
}
/// Resolve exact task ownership and scope; callers cannot supply a log path.
pub fn output(id: &str) -> Result<AutomationRunOutput, String> {
    let task = managed::find(id)?;
    let (root, path, kind) = if task.source == "hermes" {
        let root = hermes_manage::root_for(&task)?;
        let path = latest_hermes(
            &root,
            task.identifier.as_deref().ok_or("Missing Hermes job ID")?,
        )?;
        (root, path, "hermes")
    } else {
        let root = store::root();
        if let Some(dir) = native_directory(&task)? {
            let path = dir.join("output.log");
            checked(&dir, &path)?;
            (root, Some(path), "system")
        } else {
            (root, None, "unsupported")
        }
    };
    let path = match path {
        Some(path) => match fs::metadata(&path) {
            Ok(_) => Some(path),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => return Err(e.to_string()),
        },
        None => None,
    };
    match path {
        Some(path) => {
            let mut result = read_output(&root, &path)?;
            result.kind = kind.into();
            Ok(result)
        }
        _ => Ok(AutomationRunOutput {
            content: String::new(),
            truncated: false,
            available: false,
            kind: kind.into(),
        }),
    }
}
pub(super) fn read_output(root: &Path, path: &Path) -> Result<AutomationRunOutput, String> {
    checked(root, path)?;
    if !fs::metadata(path).map_err(|e| e.to_string())?.is_file() {
        return Err("Execution output is not a regular file".into());
    }
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let meta = file.metadata().map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("Execution output is not a regular file".into());
    }
    let mut bom = [0; 2];
    let read = file.read(&mut bom).map_err(|e| e.to_string())?;
    let utf16 = read == 2 && (bom == [0xff, 0xfe] || bom == [0xfe, 0xff]);
    let offset = meta.len().saturating_sub(OUTPUT_LIMIT);
    let offset = if utf16 { offset + offset % 2 } else { offset };
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| e.to_string())?;
    let mut bytes = vec![];
    file.take(OUTPUT_LIMIT)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    let content = if utf16 {
        let units: Vec<_> = bytes
            .chunks_exact(2)
            .map(|p| {
                if bom == [0xff, 0xfe] {
                    u16::from_le_bytes([p[0], p[1]])
                } else {
                    u16::from_be_bytes([p[0], p[1]])
                }
            })
            .collect();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(&bytes).into_owned()
    };
    Ok(AutomationRunOutput {
        content: content.trim_start_matches('\u{feff}').into(),
        truncated: offset > 0,
        available: true,
        kind: String::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reads_bounded_tail_and_powershell_utf16_output() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("output.log");
        fs::write(&path, vec![b'x'; OUTPUT_LIMIT as usize + 20]).unwrap();
        let output = read_output(dir.path(), &path).unwrap();
        assert!(output.truncated);
        assert_eq!(output.content.len(), OUTPUT_LIMIT as usize);
        let bytes: Vec<_> = "\u{feff}完成\n"
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect();
        fs::write(&path, bytes).unwrap();
        assert_eq!(read_output(dir.path(), &path).unwrap().content, "完成\n");
    }

    #[test]
    fn reads_latest_hermes_result_without_creating_a_history_store() {
        let root = tempfile::tempdir().unwrap();
        assert!(latest_hermes(root.path(), "audit").unwrap().is_none());
        assert!(!root.path().join("cron").exists());
        let dir = root.path().join("cron/output/audit");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("2026-10-26_09-00-00.md"), "older").unwrap();
        fs::write(dir.join("2026-10-27_09-00-00.md"), "latest").unwrap();
        fs::write(dir.join("other.md"), "ignore").unwrap();
        assert_eq!(
            fs::read_to_string(latest_hermes(root.path(), "audit").unwrap().unwrap()).unwrap(),
            "latest"
        );
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 3);
        assert!(latest_hermes(root.path(), "../outside").is_err());
    }
    #[cfg(unix)]
    #[test]
    fn refuses_symlinked_provider_output() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("secret"), "secret").unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("secret"),
            root.path().join("output.log"),
        )
        .unwrap();
        assert!(read_output(root.path(), &root.path().join("output.log")).is_err());
        std::os::unix::fs::symlink(outside.path(), root.path().join("cron")).unwrap();
        assert!(latest_hermes(root.path(), "audit").is_err());
    }
}
