//! Directory normalization runs between scheduler cleanup and runtime preparation.
use super::*;
use std::fs;

#[derive(Serialize, Deserialize)]
struct Journal {
    id: String,
    from: PathBuf,
    to: PathBuf,
    receipt: Receipt,
    binding: Binding,
}

fn journal_path(state: &Path, id: &str) -> PathBuf {
    state
        .join("directory-migrations")
        .join(format!("{}.json", id.trim_start_matches("agent_hub:")))
}

fn verify_identity(path: &Path, id: &str) -> Result<(), String> {
    super::storage::regular_directory(path)?;
    super::storage::regular_directory(&path.join(".local"))?;
    let manifest: Manifest = super::layout::read_manifest(path)?;
    if manifest.instance_id != id {
        return Err("Directory migration identity changed; files were preserved".into());
    }
    Ok(())
}

fn verify_idle(path: &Path) -> Result<(), String> {
    let receipt: Receipt = super::storage::json(&path.join(".local/receipt.json"))?;
    if !["pending", "removed"].contains(&receipt.state.as_str())
        || receipt.removal_pending
        || receipt.archived
    {
        return Err("Task runtime must be detached before directory migration".into());
    }
    for name in ["run.claim", "ready", "env"] {
        match path.join(".local").join(name).symlink_metadata() {
            Ok(_) => return Err("Task runtime remains; retry directory migration".into()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}

fn restore(state: &Path, journal: &Journal) -> Result<(), String> {
    let root = root(state);
    super::storage::regular_directory(&root)?;
    if !valid_id(&journal.id)
        || !["pending", "removed"].contains(&journal.receipt.state.as_str())
        || journal.from == journal.to
        || [&journal.from, &journal.to]
            .iter()
            .any(|path| path.parent() != Some(root.as_path()))
    {
        return Err("Invalid task directory migration journal".into());
    }
    for path in [&journal.from, &journal.to] {
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or("Invalid migration directory name")?;
        crate::core::path_guard::ensure_safe_skill_relative_path(name)
            .map_err(|error| error.to_string())?;
    }
    if !journal.from.exists() {
        verify_identity(&journal.to, &journal.id)?;
        verify_idle(&journal.to)?;
        fs::rename(&journal.to, &journal.from).map_err(|e| e.to_string())?;
    } else if journal.to.exists() {
        // Only an empty allocation may be discarded; never overwrite a second package.
        super::storage::regular_directory(&journal.to)?;
        fs::remove_dir(&journal.to)
            .map_err(|e| format!("Migration target is not empty; files were preserved: {e}"))?;
    }
    verify_identity(&journal.from, &journal.id)?;
    verify_idle(&journal.from)?;
    json_write(&journal.from.join(".local/binding.json"), &journal.binding)?;
    json_write(&journal.from.join(".local/receipt.json"), &journal.receipt)?;
    fs::remove_file(journal_path(state, &journal.id)).map_err(|e| e.to_string())
}

pub(super) fn migrate(state: &Path, id: &str) -> Result<String, String> {
    let journal_file = journal_path(state, id);
    if journal_file.exists() {
        let previous: Journal = super::storage::json(&journal_file)?;
        if previous.id != id {
            return Err("Directory migration journal does not match this task".into());
        }
        restore(state, &previous)?;
    }
    let record = find(state, id)?;
    let path = checked(state, &record)?;
    let current = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Invalid task directory name")?;
    // Existing ASCII paths remain stable when a display name is edited.
    if current.is_ascii() {
        return Ok(id.into());
    }
    let old_receipt = receipt(&record)?;
    verify_idle(&path)?;
    if store::read_registry(state)?.tasks.iter().any(|other| {
        other.id != id
            && [&other.draft.script_dir, &other.draft.workdir]
                .into_iter()
                .flatten()
                .any(|value| Path::new(value).starts_with(&path))
    }) {
        return Err(
            "Another task references this directory; update that binding before migration".into(),
        );
    }
    let revision = old_receipt
        .revision
        .max(record.revision)
        .checked_add(1)
        .ok_or("Automation revision exhausted")?;
    let target = super::super::workspace::allocate(&root(state), &record.draft.name)?;
    let journal = Journal {
        id: id.into(),
        from: path.clone(),
        to: target.clone(),
        receipt: old_receipt.clone(),
        binding: Binding {
            workdir: record.draft.workdir.clone(),
        },
    };
    if let Err(error) = json_write(&journal_file, &journal) {
        let _ = fs::remove_dir(&target);
        return Err(error);
    }
    let result = (|| {
        // Unix can atomically replace the reserved empty directory; Windows refuses it.
        #[cfg(windows)]
        fs::remove_dir(&target).map_err(|e| e.to_string())?;
        fs::rename(&path, &target).map_err(|e| e.to_string())?;
        let mut next = record.clone();
        next.draft.script_dir = Some(target.to_string_lossy().into_owned());
        if let Some(workdir) = &next.draft.workdir {
            if let Ok(relative) = Path::new(workdir).strip_prefix(&path) {
                next.draft.workdir = Some(target.join(relative).to_string_lossy().into_owned());
            }
        }
        json_write(
            &target.join(".local/binding.json"),
            &Binding {
                workdir: next.draft.workdir.clone(),
            },
        )?;
        let mut receipt = old_receipt;
        receipt.revision = revision;
        receipt.fingerprint = super::storage::fingerprint(&next.draft)?;
        receipt.pending_backup = true;
        receipt.error = None;
        write_receipt(&next, &receipt)?;
        fs::remove_file(&journal_file).map_err(|e| e.to_string())?;
        Ok::<_, String>(())
    })();
    if let Err(error) = result {
        let restoration = restore(state, &journal);
        return Err(format!(
            "Directory migration failed: {error}; restoration: {restoration:?}"
        ));
    }
    super::lifecycle::notify();
    Ok(id.into())
}

#[cfg(test)]
mod tests;
