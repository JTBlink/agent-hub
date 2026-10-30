//! Explicit migration preserves the instance ID and original project files.
use super::super::{managed, native, Provider};
use super::*;

pub fn migrate(id: &str) -> Result<String, String> {
    let state = store::root();
    let _lock = lock(&state, id)?;
    migrate_using(
        &state,
        id,
        &mut *super::registration::adapter(Provider::System),
    )
}

pub(super) fn migrate_using(
    state: &Path,
    id: &str,
    scheduler: &mut dyn super::registration::Registration,
) -> Result<String, String> {
    let Some(old) = store::legacy_task(state, id)? else {
        return super::relocation::migrate(state, id);
    };
    managed::verify(state, &old)?;
    if old.draft.provider != Provider::System {
        return Err("Only owned system tasks support package migration".into());
    }
    let next = if let Ok(package) = find(state, id) {
        package
    } else {
        let mut draft = old.draft.clone();
        if let Some(content) = native::payload::read(state, &old)? {
            draft.content = content;
        }
        draft.files = native::bundle_files::read(&old)?;
        draft.script_dir = None;
        draft.enabled = false;
        super::lifecycle::create_identity(state, draft, Vec::new(), None, false, Some(id))?;
        find(state, id)?
    };
    let path = checked(state, &next)?;
    let journal = path.join(".local/migration.json");
    if journal.exists() {
        let previous: ManagedAutomation = super::storage::json(&journal)?;
        if previous.revision != old.revision || previous.id != old.id {
            return Err("Original task changed during migration; its files were preserved".into());
        }
    } else {
        json_write(&journal, &old)?;
    }
    let result = (|| {
        scheduler.apply(state, &mut old.clone(), false)?;
        let manifest: Manifest = super::storage::json(&path.join("task.json"))?;
        let mut configured = next.clone();
        configured.draft.enabled = old.draft.enabled;
        configured.revision = old
            .revision
            .checked_add(1)
            .ok_or("Automation revision exhausted")?;
        super::storage::materialize(&configured, manifest.dependencies, manifest.hermes)?;
        let mut receipt = receipt(&configured)?;
        receipt.revision = configured.revision;
        receipt.fingerprint = super::storage::fingerprint(&configured.draft)?;
        receipt.state = "uninstalled".into();
        receipt.archived = false;
        write_receipt(&configured, &receipt)?;
        let mut paused = configured.clone();
        paused.draft.enabled = false;
        super::lifecycle::install_using(state, &paused, scheduler)?;
        store::retire_legacy(state, id)?;
        scheduler.apply(state, &mut configured, old.draft.enabled)?;
        Ok::<_, String>(())
    })();
    if let Err(error) = result {
        let _ = std::fs::remove_file(path.join(".local/ready"));
        let rollback = scheduler
            .apply(state, &mut old.clone(), old.draft.enabled)
            .and_then(|()| store::restore_legacy(state, &old));
        let mut receipt = receipt(&next)?;
        receipt.state = "install_failed".into();
        receipt.error = Some(format!(
            "Migration failed: {error}; restoration: {rollback:?}"
        ));
        write_receipt(&next, &receipt)?;
        return Err(receipt.error.unwrap_or(error));
    }
    std::fs::remove_file(journal).map_err(|e| e.to_string())?;
    #[cfg(not(test))]
    crate::core::auto_backup::notify_central_change();
    Ok(id.into())
}
