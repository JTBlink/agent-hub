//! Publish portable task directories next to skills; retain legacy JSON readers.
use super::*;
use crate::core::automation::package;
use std::{collections::BTreeSet, fs};
use unicode_normalization::UnicodeNormalization;

// Avoid collisions on case-insensitive and Unicode-normalizing filesystems too.
fn name_key(name: &str) -> String {
    name.nfc().flat_map(char::to_lowercase).collect()
}

/// Stage every package before replacing the managed automation subtree.
pub(crate) fn export(metadata: &Path, repository: &Path) -> Result<(), String> {
    let records = read(metadata)?;
    let stage = tempfile::tempdir_in(repository).map_err(|e| e.to_string())?;
    let content = stage.path().join("automations");
    fs::create_dir(&content).map_err(|e| e.to_string())?;
    let names: Vec<_> = records
        .values()
        .map(|record| workspace::directory_name(&record.draft.name))
        .collect();
    // Reserve natural names first so duplicate "Audit" never takes the real "Audit-2".
    let reserved: BTreeSet<_> = names.iter().map(|name| name_key(name)).collect();
    let mut used = BTreeSet::new();
    for (record, base) in records.values().zip(names) {
        let name = (1..=10000)
            .find_map(|number| {
                let candidate = if number == 1 {
                    base.clone()
                } else {
                    format!("{base}-{number}")
                };
                let key = name_key(&candidate);
                if (number > 1 && reserved.contains(&key)) || !used.insert(key) {
                    None
                } else {
                    Some(candidate)
                }
            })
            .ok_or("Too many automation backups with the same name")?;
        // Identity stays inside task.json; directory names are only for human navigation.
        package::write_backup_directory(record, &content.join(name))?;
    }
    let target = repository.join("automations");
    if target.is_symlink() {
        return Err("Linked automation backup directory is not supported".into());
    }
    let previous = stage.path().join("previous");
    let existed = target.exists();
    if existed {
        fs::rename(&target, &previous).map_err(|e| e.to_string())?;
    }
    if let Err(error) = fs::rename(content, &target) {
        if existed {
            fs::rename(previous, target).map_err(|e| format!("{error}; restoration: {e}"))?;
        }
        return Err(error.to_string());
    }
    // New writes have one public representation; old flat files remain readable.
    for name in read(&repository.join(".agent-hub"))?.keys() {
        fs::remove_file(repository.join(".agent-hub").join(name)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Import only definitions into the local metadata namespace, never install tasks.
pub(crate) fn import(repository: &Path, metadata: &Path) -> Result<bool, String> {
    let mut records = read(&repository.join(".agent-hub"))?;
    let root = repository.join("automations");
    let present = match root.symlink_metadata() {
        Ok(_) => true,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => return Err(error.to_string()),
    };
    if present {
        if root.is_symlink() || !root.is_dir() {
            return Err("Invalid automation backup directory".into());
        }
        let mut ids = std::collections::BTreeSet::new();
        for (index, entry) in walkdir::WalkDir::new(&root)
            .max_depth(6)
            .follow_links(false)
            .into_iter()
            .enumerate()
        {
            if index >= 8192 {
                return Err("Automation backup is too large".into());
            }
            let entry = entry.map_err(|e| e.to_string())?;
            if crate::core::path_guard::is_link_or_reparse_point(
                &entry.metadata().map_err(|e| e.to_string())?,
            ) {
                return Err("Automation backups cannot contain links".into());
            }
            if !entry.file_type().is_file() || entry.file_name() != "task.json" {
                continue;
            }
            let record =
                package::read_backup_directory(package::manifest_directory(entry.path())?)?;
            if !ids.insert(record.id.clone()) {
                return Err("Duplicate automation backup identity".into());
            }
            records.insert(filename(&record.id)?, record);
        }
    }
    project_records(&records, metadata)
}

#[cfg(test)]
mod tests;
