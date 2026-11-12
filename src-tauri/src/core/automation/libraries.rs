//! User-owned shared automation libraries. One current copy; history belongs to Git.
pub(crate) mod backup;
mod storage;
#[cfg(test)]
mod tests;

use super::{package::Dependency, store, AutomationScriptFile};
#[cfg(any(feature = "cloud-sync", test))]
pub(crate) use backup::{differs, flush, project};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};
pub(crate) use storage::{read, write};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct LibraryManifest {
    pub schema_version: u32,
    pub name: String,
    pub version: String,
    pub files: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct LibraryPackage {
    pub manifest: LibraryManifest,
    pub files: Vec<AutomationScriptFile>,
}
#[derive(Serialize)]
pub struct LibraryInfo {
    pub name: String,
    pub version: String,
    pub revision: String,
    pub path: PathBuf,
    pub files: Vec<String>,
    pub dependents: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package: Option<LibraryPackage>,
}

pub fn root() -> PathBuf {
    #[cfg(test)]
    {
        super::super::central_repo::base_dir().join("automation-libraries-test")
    }
    #[cfg(not(test))]
    {
        super::workspace::workspace_root().join("_shared")
    }
}

pub(super) fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 80
        && name.as_bytes()[0].is_ascii_lowercase()
        && name
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"_-".contains(&b))
}

pub fn validate_name(name: &str) -> Result<(), String> {
    if valid_name(name) {
        Ok(())
    } else {
        Err("Library names require lowercase ASCII letters, digits, hyphens or underscores".into())
    }
}

fn declared(record: &super::ManagedAutomation, name: &str) -> bool {
    record
        .draft
        .package_options
        .as_ref()
        .is_some_and(|options| {
            options
                .dependencies
                .iter()
                .any(|d| matches!(d, Dependency::Library { name: n } if n == name))
        })
}

fn dependents(name: &str, updating: bool) -> Result<Vec<String>, String> {
    let mut ids = vec![];
    for record in store::load(&store::root())? {
        if declared(&record, name) {
            let state = if updating {
                super::native::state(&record)
            } else {
                Some(false)
            };
            let unverified = state.is_none()
                && (record.draft.enabled
                    || record.draft.provider != super::Provider::System
                    || super::native::directory(&store::root(), &record)
                        .join("run.claim")
                        .exists());
            if updating && (state == Some(true) || unverified) {
                return Err(format!(
                    "Library is used by a running or unverified task: {}",
                    record.draft.name
                ));
            }
            ids.push(record.id);
        }
    }
    Ok(ids)
}

pub fn resolve(name: &str, content: bool) -> Result<LibraryInfo, String> {
    validate_name(name)?;
    let directory = root();
    let _lock = storage::lock(&directory)?;
    storage::recover(&directory, name)?;
    let package = read(&directory.join(name))?;
    if package.manifest.name != name {
        return Err("Library name and directory disagree".into());
    }
    info(&directory, package, content)
}

fn info(root: &Path, package: LibraryPackage, content: bool) -> Result<LibraryInfo, String> {
    Ok(LibraryInfo {
        name: package.manifest.name.clone(),
        version: package.manifest.version.clone(),
        revision: storage::revision(&package)?,
        path: root.join(&package.manifest.name),
        files: package.manifest.files.clone(),
        dependents: dependents(&package.manifest.name, false)?,
        package: content.then_some(package),
    })
}

pub fn preview(path: &Path) -> Result<LibraryPackage, String> {
    read(path)
}

pub fn list() -> Result<Vec<LibraryInfo>, String> {
    current_snapshot(&root())?
        .into_values()
        .map(|package| info(&root(), package, false))
        .collect()
}

pub(crate) fn current_snapshot(root: &Path) -> Result<BTreeMap<String, LibraryPackage>, String> {
    if !root.exists() {
        return Ok(BTreeMap::new());
    }
    let _lock = storage::lock(root)?;
    storage::recover_all(root)?;
    snapshot(root)
}

pub(crate) fn snapshot(root: &Path) -> Result<BTreeMap<String, LibraryPackage>, String> {
    let mut values = BTreeMap::new();
    if !root.exists() {
        return Ok(values);
    }
    storage::directory(root)?;
    for entry in std::fs::read_dir(root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        if !valid_name(&name) || !entry.path().join("library.json").exists() {
            return Err(format!("Invalid automation library directory: {name}"));
        }
        if values.len() >= 64 {
            return Err("Too many automation libraries".into());
        }
        let package = read(&entry.path())?;
        if package.manifest.name != name {
            return Err("Library name and directory disagree".into());
        }
        values.insert(name, package);
    }
    Ok(values)
}

/// Import/update declared content only; never execute installation hooks or code.
pub fn import(path: &Path, revision: Option<&str>) -> Result<LibraryInfo, String> {
    let package = read(path)?;
    let name = &package.manifest.name;
    dependents(name, true)?;
    let root = root();
    let _lock = storage::lock(&root)?;
    storage::recover(&root, name)?;
    let target = root.join(name);
    if target.exists() {
        let old = read(&target)?;
        if revision != Some(storage::revision(&old)?.as_str()) {
            return Err("Library changed; provide its current revision before updating".into());
        }
    } else if revision.is_some() {
        return Err("Library no longer exists".into());
    }
    storage::replace(&root, &package)?;
    drop(_lock);
    super::super::cloud_sync::notify_central_change();
    info(&root, package, false)
}

pub fn remove(name: &str, revision: &str) -> Result<(), String> {
    validate_name(name)?;
    if backup::referenced(&super::super::sync_metadata::metadata_dir(), name)?
        || !dependents(name, false)?.is_empty()
    {
        return Err("Library is still referenced by local tasks or task backups".into());
    }
    let root = root();
    let _lock = storage::lock(&root)?;
    storage::recover(&root, name)?;
    let package = read(&root.join(name))?;
    if storage::revision(&package)? != revision {
        return Err("Library changed; refresh before deleting".into());
    }
    storage::removable(&root.join(name))?;
    std::fs::remove_dir_all(root.join(name)).map_err(|e| e.to_string())?;
    super::super::cloud_sync::notify_central_change();
    Ok(())
}

pub fn backups() -> Result<Vec<LibraryPackage>, String> {
    Ok(backup::read(&super::super::sync_metadata::metadata_dir())?
        .into_values()
        .collect())
}

/// Restore never overwrites a different current library without its revision.
pub fn restore(name: &str, revision: Option<&str>, apply: bool) -> Result<LibraryPackage, String> {
    validate_name(name)?;
    let package = backup::read(&super::super::sync_metadata::metadata_dir())?
        .remove(name)
        .ok_or("Library backup not found")?;
    if apply {
        let stage = tempfile::tempdir().map_err(|e| e.to_string())?;
        write(stage.path(), &package)?;
        import(stage.path(), revision)?;
    }
    Ok(package)
}

pub fn python_loader() -> Result<PathBuf, String> {
    super::super::python_support::publish("automation_library", include_str!("libraries/loader.py"))
        .map_err(|e| e.to_string())
}

pub(crate) fn watch_paths() -> Vec<PathBuf> {
    let root = root();
    let mut paths = vec![root.clone()];
    if let Some(parent) = root.parent() {
        paths.push(parent.to_path_buf());
    }
    if let Ok(packages) = current_snapshot(&root) {
        for (name, package) in packages {
            let directory = root.join(name);
            paths.push(directory.clone());
            for file in package.manifest.files {
                if let Some(parent) = directory.join(file).parent() {
                    paths.push(parent.to_path_buf());
                }
            }
        }
    }
    paths
}

/// Directory replacement and declared-source edits must wake the existing backup loop.
pub(crate) fn definition_event(path: &Path) -> bool {
    let root = root();
    path == root
        || path.strip_prefix(root).is_ok_and(|relative| {
            !relative
                .components()
                .any(|part| part.as_os_str().to_string_lossy().starts_with('.'))
        })
}
