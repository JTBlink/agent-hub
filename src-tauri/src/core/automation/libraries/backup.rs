//! Library metadata shares the existing backup transaction and merge namespace.
use super::*;
use std::fs;
const PREFIX: &str = "automation_library-";
fn filename(name: &str) -> String {
    format!("{PREFIX}{name}.json")
}

pub(crate) fn read(metadata: &Path) -> Result<BTreeMap<String, LibraryPackage>, String> {
    let mut values = BTreeMap::new();
    if !metadata.exists() {
        return Ok(values);
    }
    storage::directory(metadata)?;
    for entry in fs::read_dir(metadata).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with(PREFIX) || !name.ends_with(".json") {
            continue;
        }
        let value: LibraryPackage =
            serde_json::from_str(&storage::json_text(&entry.path())?).map_err(|e| e.to_string())?;
        storage::validate(&value)?;
        if filename(&value.manifest.name) != name {
            return Err("Library backup identity mismatch".into());
        }
        values.insert(value.manifest.name.clone(), value);
    }
    Ok(values)
}
#[cfg(any(feature = "cloud-sync", test))]
fn write_records(
    metadata: &Path,
    values: &BTreeMap<String, LibraryPackage>,
) -> Result<bool, String> {
    let previous = read(metadata)?;
    if &previous == values {
        return Ok(false);
    }
    fs::create_dir_all(metadata).map_err(|e| e.to_string())?;
    for (name, package) in values {
        let bytes = serde_json::to_vec(package).map_err(|e| e.to_string())?;
        let path = metadata.join(filename(name));
        if fs::read(&path).ok().as_deref() != Some(bytes.as_slice()) {
            store::write(&path, &bytes)?;
        }
    }
    for name in previous.keys().filter(|name| !values.contains_key(*name)) {
        fs::remove_file(metadata.join(filename(name))).map_err(|e| e.to_string())?;
    }
    Ok(true)
}
fn index(root: &Path) -> Result<BTreeMap<String, String>, String> {
    let path = root.join(".local/backup-index.json");
    if !path.exists() {
        return Ok(BTreeMap::new());
    }
    let value: BTreeMap<String, String> =
        serde_json::from_str(&storage::text(&path)?).map_err(|e| e.to_string())?;
    if value.keys().any(|name| !valid_name(name)) {
        return Err("Invalid library backup index".into());
    }
    Ok(value)
}
fn revisions(
    values: &BTreeMap<String, LibraryPackage>,
) -> Result<BTreeMap<String, String>, String> {
    values
        .iter()
        .map(|(name, value)| Ok((name.clone(), storage::revision(value)?)))
        .collect()
}
pub(super) fn referenced(metadata: &Path, name: &str) -> Result<bool, String> {
    Ok(super::super::backup::read(metadata)?.values().any(|record|
        record.draft.package_options.as_ref().is_some_and(|options| options.dependencies.iter()
            .any(|dependency| matches!(dependency, Dependency::Library { name: value } if value == name)))))
}
#[cfg(any(feature = "cloud-sync", test))]
pub(crate) fn flush(root: &Path, metadata: &Path) -> Result<(), String> {
    let local = current_snapshot(root)?;
    let current = revisions(&local)?;
    let previous = index(root)?;
    let mut values = read(metadata)?;
    for name in previous.keys().filter(|name| !current.contains_key(*name)) {
        if referenced(metadata, name)?
            || (root == super::root() && !super::dependents(name, false)?.is_empty())
        {
            return Err(format!("Required library {name} disappeared; restore it before backing up task definitions"));
        }
        values.remove(name);
    }
    for (name, package) in local {
        if previous.get(&name) != current.get(&name) {
            values.insert(name, package);
        }
    }
    write_records(metadata, &values)?;
    if current != previous {
        store::write(
            &root.join(".local/backup-index.json"),
            &serde_json::to_vec(&current).map_err(|e| e.to_string())?,
        )?;
    }
    Ok(())
}
#[cfg(any(feature = "cloud-sync", test))]
pub(crate) fn differs(source: &Path, target: &Path) -> Result<bool, String> {
    Ok(read(source)? != read(target)?)
}
pub(crate) fn pending() -> bool {
    current_snapshot(&root())
        .and_then(|values| Ok(revisions(&values)? != index(&root())?))
        .unwrap_or(true)
}
#[cfg(any(feature = "cloud-sync", test))]
pub(crate) fn project(source: &Path, target: &Path) -> Result<bool, String> {
    write_records(target, &read(source)?)
}
#[cfg(any(feature = "cloud-sync", test))]
pub(crate) fn export(metadata: &Path, automation_directory: &Path) -> Result<(), String> {
    let available = read(metadata)?;
    for record in super::super::backup::read(metadata)?.values() {
        if let Some(options) = &record.draft.package_options {
            for dependency in &options.dependencies {
                if let Dependency::Library { name } = dependency {
                    if !available.contains_key(name) {
                        return Err(format!("Task backup requires missing library {name}"));
                    }
                }
            }
        }
    }
    for (name, package) in read(metadata)? {
        write(&automation_directory.join("_shared").join(name), &package)?;
    }
    Ok(())
}
#[cfg(any(feature = "cloud-sync", test))]
pub(crate) fn import(automation_directory: &Path, metadata: &Path) -> Result<bool, String> {
    write_records(metadata, &snapshot(&automation_directory.join("_shared"))?)
}
