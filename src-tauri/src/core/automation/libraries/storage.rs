use super::*;
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, fs};

const LIMIT: usize = 1024 * 1024;
pub(super) fn directory(path: &Path) -> Result<(), String> {
    super::super::package::regular_directory(path)
}
fn text_limit(path: &Path, limit: usize) -> Result<String, String> {
    super::super::native::payload::read_file_with_limit(path, limit as u64)?
        .ok_or_else(|| "Library declaration or source file is missing".into())
}
pub(super) fn text(path: &Path) -> Result<String, String> {
    text_limit(path, LIMIT)
}
pub(super) fn json_text(path: &Path) -> Result<String, String> {
    text_limit(path, 8 * LIMIT)
}
pub(super) fn lock(root: &Path) -> Result<store::Lock, String> {
    if root.symlink_metadata().is_ok() {
        directory(root)?;
    } else {
        fs::create_dir_all(root).map_err(|e| e.to_string())?;
    }
    let local = root.join(".local");
    if local.symlink_metadata().is_ok() {
        directory(&local)?;
    } else {
        fs::create_dir(&local).map_err(|e| e.to_string())?;
    }
    super::super::output::checked(root, &local.join(".lock"))?;
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
    loop {
        match store::Lock::acquire(&local) {
            Ok(lock) => return Ok(lock),
            Err(error) if std::time::Instant::now() >= deadline => return Err(error),
            Err(_) => std::thread::sleep(std::time::Duration::from_millis(20)),
        }
    }
}
pub(super) fn validate(package: &LibraryPackage) -> Result<(), String> {
    let manifest = &package.manifest;
    validate_name(&manifest.name)?;
    super::super::package::validate_version(Some(&manifest.version))?;
    if manifest.schema_version != 1
        || manifest.files.is_empty()
        || manifest.files.len() > 64
        || manifest.files.len() != package.files.len()
    {
        return Err("Invalid library format, version or file count".into());
    }
    let mut names = BTreeSet::new();
    let mut portable_names = BTreeSet::new();
    let mut total = 0;
    for file in &package.files {
        use unicode_normalization::UnicodeNormalization;
        let portable: String = file.path.nfc().flat_map(char::to_lowercase).collect();
        if !portable_names.insert(portable) {
            return Err("Library paths collide on portable filesystems".into());
        }
        crate::core::path_guard::ensure_safe_skill_relative_path(&file.path)
            .map_err(|e| e.to_string())?;
        if file.path.len() > 240
            || file.path.contains(['\\', ':'])
            || file.path.split('/').any(|p| p.starts_with('.'))
            || file.path == "library.json"
            || ![".py", ".json", ".md", ".sh", ".ps1"]
                .iter()
                .any(|e| file.path.ends_with(e))
            || !names.insert(file.path.as_str())
            || file.content.contains('\0')
            || file.content.is_empty()
        {
            return Err("Invalid, private or duplicate library file".into());
        }
        total += file.content.len();
    }
    if total > LIMIT
        || manifest.files.len() != names.len()
        || manifest.files.iter().any(|f| !names.contains(f.as_str()))
    {
        return Err("Library files must match the manifest and total at most 1 MiB".into());
    }
    Ok(())
}
pub(crate) fn read(path: &Path) -> Result<LibraryPackage, String> {
    directory(path)?;
    let manifest: LibraryManifest =
        serde_json::from_str(&text(&path.join("library.json"))?).map_err(|e| e.to_string())?;
    if manifest.files.len() > 64 {
        return Err("Too many library files".into());
    }
    let placeholders = manifest
        .files
        .iter()
        .map(|path| AutomationScriptFile {
            path: path.clone(),
            content: "x".into(),
        })
        .collect();
    validate(&LibraryPackage {
        manifest: manifest.clone(),
        files: placeholders,
    })?;
    let mut package = LibraryPackage {
        manifest,
        files: vec![],
    };
    for name in &package.manifest.files {
        let file = super::super::native::bundle_files::path(&path.to_string_lossy(), name, false)?;
        package.files.push(AutomationScriptFile {
            path: name.clone(),
            content: text(&file)?,
        });
    }
    validate(&package)?;
    Ok(package)
}
pub(crate) fn write(path: &Path, package: &LibraryPackage) -> Result<(), String> {
    validate(package)?;
    fs::create_dir_all(path).map_err(|e| e.to_string())?;
    directory(path)?;
    for file in &package.files {
        let target =
            super::super::native::bundle_files::path(&path.to_string_lossy(), &file.path, true)?;
        super::super::output::checked(path, &target)?;
        store::write(&target, file.content.as_bytes())?;
    }
    store::write(
        &path.join("library.json"),
        &serde_json::to_vec_pretty(&package.manifest).map_err(|e| e.to_string())?,
    )
}
pub(super) fn revision(package: &LibraryPackage) -> Result<String, String> {
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(package).map_err(|e| e.to_string())?)
    ))
}
fn owned_content(path: &Path, allow_private: bool) -> Result<(), String> {
    let package = read(path)?;
    let mut allowed: BTreeSet<_> = package.manifest.files.iter().cloned().collect();
    allowed.insert("library.json".into());
    let private = path.join(".local");
    if allow_private && private.symlink_metadata().is_ok() {
        directory(&private)?;
    }
    let entries = walkdir::WalkDir::new(path)
        .follow_links(false)
        .max_depth(128)
        .into_iter()
        .filter_entry(|entry| !(allow_private && entry.path() == private));
    for (index, entry) in entries.enumerate() {
        if index >= 4096 {
            return Err("Library contains too many undeclared entries; files preserved".into());
        }
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.depth() == 0 {
            continue;
        }
        if crate::core::path_guard::is_link_or_reparse_point(
            &entry.metadata().map_err(|e| e.to_string())?,
        ) {
            return Err("Library contains an undeclared link; files preserved".into());
        }
        if entry.file_type().is_file() {
            let relative = entry
                .path()
                .strip_prefix(path)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            if !allowed.contains(&relative) {
                return Err("Library contains undeclared local files; files preserved".into());
            }
        }
    }
    Ok(())
}
pub(super) fn removable(path: &Path) -> Result<(), String> {
    owned_content(path, false)
}

fn journal(root: &Path, name: &str) -> PathBuf {
    root.join(".local").join(format!("operation-{name}.json"))
}
fn previous(root: &Path, name: &str) -> PathBuf {
    root.join(".local/previous").join(name)
}
pub(super) fn recover_all(root: &Path) -> Result<(), String> {
    let local = root.join(".local");
    for (index, entry) in fs::read_dir(&local).map_err(|e| e.to_string())?.enumerate() {
        if index > 256 {
            return Err("Too many library recovery entries".into());
        }
        let entry = entry.map_err(|e| e.to_string())?;
        let filename = entry.file_name().to_string_lossy().into_owned();
        if let Some(name) = filename
            .strip_prefix("operation-")
            .and_then(|name| name.strip_suffix(".json"))
        {
            validate_name(name)?;
            recover(root, name)?;
        }
    }
    Ok(())
}

pub(super) fn recover(root: &Path, name: &str) -> Result<(), String> {
    let journal = journal(root, name);
    let old = previous(root, name);
    let target = root.join(name);
    for path in [&journal, &old, &target] {
        super::super::output::checked(root, path)?;
    }
    if !journal.exists() {
        if old.exists() {
            return Err(
                "Library recovery content has no journal; preserve it for inspection".into(),
            );
        }
        return Ok(());
    }
    let marker: String = serde_json::from_str(&text(&journal)?).map_err(|e| e.to_string())?;
    if marker != name {
        return Err("Library recovery identity mismatch".into());
    }
    if old.exists() {
        directory(&old)?;
        if target.exists() {
            read(&target)?;
            let private = old.join(".local");
            if private.symlink_metadata().is_ok() {
                directory(&private)?;
                if target.join(".local").symlink_metadata().is_ok() {
                    return Err(
                        "Conflicting private library state; recovery files preserved".into(),
                    );
                }
                fs::rename(private, target.join(".local")).map_err(|e| e.to_string())?;
            }
            fs::remove_dir_all(&old).map_err(|e| e.to_string())?;
        } else {
            fs::rename(old, target).map_err(|e| e.to_string())?;
        }
    }
    fs::remove_file(journal).map_err(|e| e.to_string())
}
pub(super) fn replace(root: &Path, package: &LibraryPackage) -> Result<(), String> {
    let name = &package.manifest.name;
    let target = root.join(name);
    let old = previous(root, name);
    if target.exists() {
        owned_content(&target, true)?;
    }
    let stage = tempfile::tempdir_in(root).map_err(|e| e.to_string())?;
    write(&stage.path().join("content"), package)?;
    let previous_root = root.join(".local/previous");
    super::super::output::checked(root, &previous_root)?;
    fs::create_dir_all(&previous_root).map_err(|e| e.to_string())?;
    directory(&previous_root)?;
    store::write(
        &journal(root, name),
        &serde_json::to_vec(name).map_err(|e| e.to_string())?,
    )?;
    if target.exists() {
        directory(&target)?;
        fs::rename(&target, &old).map_err(|e| e.to_string())?;
    }
    if let Err(error) = fs::rename(stage.path().join("content"), &target) {
        recover(root, name)?;
        return Err(error.to_string());
    }
    recover(root, name)
}
