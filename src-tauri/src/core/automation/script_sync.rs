//! Reconcile customized workspace scripts into portable, revisioned definitions.
use super::{managed, native::payload, store, Provider};
use std::path::Path;
use std::time::{Duration, Instant};

/// How long a read waits for another automation operation before using saved definitions.
const READ_WAIT: Duration = Duration::from_secs(5);

pub fn sync_workspace_scripts() -> Result<(), String> {
    sync_at(&store::root())
}

/// Reconcile before a read-only listing; a busy store leaves saved definitions authoritative.
/// Returns whether synchronization ran, so callers can say the listing may be stale.
pub fn sync_workspace_scripts_for_read() -> Result<bool, String> {
    sync_for_read(&store::root(), READ_WAIT)
}

pub(super) fn sync_for_read(root: &Path, wait: Duration) -> Result<bool, String> {
    if !root.join("tasks.json").is_file() {
        return Ok(true);
    }
    let deadline = Instant::now() + wait;
    let lock = loop {
        match store::Lock::acquire(root) {
            Ok(lock) => break lock,
            Err(_) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(100)),
            Err(_) => return Ok(false),
        }
    };
    sync_locked(root, lock)?;
    Ok(true)
}

pub(super) fn sync_at(root: &Path) -> Result<(), String> {
    // Package bodies are read directly and carry content-derived revisions.
    if !root.join("tasks.json").is_file() {
        return Ok(());
    }
    sync_locked(root, store::Lock::acquire(root)?)
}

fn sync_locked(root: &Path, _lock: store::Lock) -> Result<(), String> {
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
