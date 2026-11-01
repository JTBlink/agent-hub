//! Reconcile customized workspace scripts into portable, revisioned definitions.
use super::{managed, native::payload, store, Provider};
use std::path::Path;

pub fn sync_workspace_scripts() -> Result<(), String> {
    sync_at(&store::root())
}

pub(super) fn sync_at(root: &Path) -> Result<(), String> {
    // Package bodies are read directly and carry content-derived revisions.
    if !root.join("tasks.json").is_file() {
        return Ok(());
    }
    let _lock = store::Lock::acquire(root)?;
    let registry = store::read_registry(root)?;
    let mut records = registry.tasks;
    let mut changed = false;
    let mut errors = Vec::new();
    for record in records.iter_mut().filter(|record| {
        record.draft.provider == Provider::System
            && super::package::directory(record).is_none()
            && record.draft.scripts_dir().is_some()
            && !registry.removal_pending.contains(&record.id)
    }) {
        let result = (|| {
            managed::verify(root, record)?;
            let mut draft = record.draft.clone();
            if let Some(content) = payload::read(root, record)? {
                draft.content = content;
            }
            draft.files = super::native::bundle_files::read(record)?;
            draft.validate()?;
            Ok::<_, String>(draft)
        })();
        match result {
            Ok(draft) if draft != record.draft => {
                record.draft = draft;
                record.revision = record
                    .revision
                    .checked_add(1)
                    .ok_or("Automation revision exhausted")?;
                changed = true;
            }
            Err(error) => errors.push(format!("{}: {error}", record.draft.name)),
            _ => {}
        }
    }

    if changed {
        store::save(root, records)?;
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

#[cfg(test)]
mod tests;
