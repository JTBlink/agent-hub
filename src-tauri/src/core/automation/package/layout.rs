//! One package layout for source, installation and backup; root manifests stay readable.
use super::*;

pub(crate) fn manifest_path(directory: &Path) -> PathBuf {
    let current = directory.join("config/task.json");
    let legacy = directory.join("task.json");
    if current.symlink_metadata().is_ok() || legacy.symlink_metadata().is_err() {
        current
    } else {
        legacy
    }
}

pub(crate) fn manifest_directory(file: &Path) -> Result<&Path, String> {
    let parent = file.parent().ok_or("Missing task directory")?;
    if file.file_name().is_some_and(|name| name == "task.json")
        && parent.file_name().is_some_and(|name| name == "config")
    {
        parent
            .parent()
            .ok_or_else(|| "Missing task directory".into())
    } else {
        Ok(parent)
    }
}

fn check(directory: &Path) -> Result<(), String> {
    storage::regular_directory(directory)?;
    let current = directory.join("config/task.json");
    if current.symlink_metadata().is_ok() {
        storage::regular_directory(&directory.join("config"))?;
        if directory.join("task.json").symlink_metadata().is_ok() {
            return Err("Task package contains both config/task.json and legacy task.json".into());
        }
    }
    Ok(())
}

pub(super) fn read_manifest(directory: &Path) -> Result<Manifest, String> {
    check(directory)?;
    storage::json(&manifest_path(directory))
}

pub(super) fn write_manifest(directory: &Path, manifest: &Manifest) -> Result<(), String> {
    check(directory)?;
    let path = manifest_path(directory);
    let relative = path.strip_prefix(directory).map_err(|e| e.to_string())?;
    let target = super::super::native::bundle_files::path(
        &directory.to_string_lossy(),
        &relative.to_string_lossy(),
        true,
    )?;
    json_write(&target, manifest)
}

#[cfg(test)]
mod tests;
