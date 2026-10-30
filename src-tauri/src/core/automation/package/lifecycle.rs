//! Per-task lifecycle. State is durable before every external side effect.
use super::super::Provider;
pub(super) use super::creation::{create, create_identity};
use super::*;
use std::fs;

pub(super) fn notify() {
    #[cfg(not(test))]
    crate::core::auto_backup::notify_central_change();
}

pub fn install(id: &str) -> Result<(), String> {
    let state = store::root();
    let _lock = lock(&state, id)?;
    let record = find(&state, id)?;
    install_at(&state, &record)
}

pub(super) fn install_at(state: &Path, original: &ManagedAutomation) -> Result<(), String> {
    install_using(
        state,
        original,
        &mut *super::registration::adapter(original.draft.provider),
    )
}

pub(super) fn install_using(
    state: &Path,
    original: &ManagedAutomation,
    scheduler: &mut dyn super::registration::Registration,
) -> Result<(), String> {
    let recovered = recover_update(state, original)?;
    let original = recovered.as_ref().unwrap_or(original);
    let path = checked(state, original)?;
    let mut record = original.clone();
    let mut receipt = receipt(&record)?;
    record.identifier = receipt.identifier.clone();
    record.location = receipt.location.clone();
    if receipt.removal_pending {
        return Err("Task deletion is pending; retry deletion".into());
    }
    if receipt.state == "installed" && path.join(".local/ready").is_file() {
        return Ok(());
    }
    if ["uninstalling", "uninstall_failed"].contains(&receipt.state.as_str()) {
        return Err("Complete uninstallation before reinstalling".into());
    }
    block(&path, &record)?;
    receipt.state = "installing".into();
    receipt.error = None;
    write_receipt(&record, &receipt)?;
    let result = (|| {
        let manifest: Manifest = super::storage::json(&path.join("task.json"))?;
        super::dependencies::prepare(&path, &manifest.dependencies)?;
        super::privileged::prepare(&record)?;
        scheduler.apply(state, &mut record, false)?;
        receipt.identifier = record.identifier.clone();
        receipt.location = record.location.clone();
        // Durable target identity precedes enabling: retries never create a second job.
        write_receipt(&record, &receipt)?;
        let marker = path.join(".local/hermes-create-pending");
        if marker.exists() && !record.identifier.is_empty() {
            fs::remove_file(marker).map_err(|e| e.to_string())?;
        }
        receipt.state = "installed".into();
        receipt.error = None;
        write_receipt(&record, &receipt)?;
        store::write(&path.join(".local/ready"), b"1")?;
        let enabled = record.draft.enabled;
        scheduler.apply(state, &mut record, enabled)?;
        Ok::<_, String>(())
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(path.join(".local/ready"));
        let preserved = record.draft.provider == Provider::Hermes
            && !original.identifier.is_empty()
            && original.identifier == record.identifier;
        let rollback = if preserved {
            super::super::hermes_manage::root_for(&super::registration::task(&record)).and_then(
                |home| super::super::hermes_manage::action_at(&home, "pause", &record.identifier),
            )
        } else {
            scheduler.remove(state, &record)
        };
        if rollback.is_ok() && record.draft.provider == Provider::Hermes && !preserved {
            receipt.identifier.clear();
        }
        receipt.state = "install_failed".into();
        receipt.error = Some(format!("{error}; scheduler cleanup: {rollback:?}"));
        write_receipt(&record, &receipt)?;
        return Err(receipt.error.unwrap_or(error));
    }
    notify();
    Ok(())
}

pub(super) fn block(path: &Path, record: &ManagedAutomation) -> Result<(), String> {
    let running = if record.draft.provider == Provider::Hermes && !record.identifier.is_empty() {
        let root = super::super::hermes_manage::root_for(&super::registration::task(record))?;
        super::super::hermes::at(&root)?.iter().any(|task| {
            task.identifier.as_deref() == Some(record.identifier.as_str())
                && task.status == "running"
        })
    } else {
        false
    };
    let ready = path.join(".local/ready");
    match fs::remove_file(&ready) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.to_string()),
    }
    if path.join(".local/run.claim").exists() || running {
        if receipt(record)?.state == "installed" {
            store::write(&ready, b"1")?;
        }
        return Err("Wait for the current task run to finish before changing installation".into());
    }
    Ok(())
}

pub fn uninstall(id: &str) -> Result<(), String> {
    let state = store::root();
    let _lock = lock(&state, id)?;
    let record = find(&state, id)?;
    uninstall_at(&state, &record)
}

fn uninstall_at(state: &Path, record: &ManagedAutomation) -> Result<(), String> {
    uninstall_using(
        state,
        record,
        &mut *super::registration::adapter(record.draft.provider),
    )
}

pub(super) fn uninstall_using(
    state: &Path,
    record: &ManagedAutomation,
    scheduler: &mut dyn super::registration::Registration,
) -> Result<(), String> {
    let recovered = recover_update(state, record)?;
    let record = recovered.as_ref().unwrap_or(record);
    let path = checked(state, record)?;
    let mut receipt = receipt(record)?;
    if receipt.state == "uninstalled" {
        return Ok(());
    }
    block(&path, record)?;
    receipt.state = "uninstalling".into();
    receipt.error = None;
    write_receipt(record, &receipt)?;
    let result = (|| {
        scheduler.remove(state, record)?;
        super::privileged::cleanup(record)?;
        if record.draft.provider == Provider::Hermes {
            super::hermes_bridge::cleanup(record)?;
        }
        let marker = path.join(".local/hermes-create-pending");
        if marker.exists() {
            fs::remove_file(marker).map_err(|e| e.to_string())?;
        }
        let env = path.join(".local/env");
        if store::read_registry(state)?.tasks.iter().any(|other| {
            other.id != record.id
                && [&other.draft.script_dir, &other.draft.workdir]
                    .into_iter()
                    .flatten()
                    .any(|p| crate::core::path_guard::is_path_safe(&env, Path::new(p)))
        }) {
            return Err(
                "Private environment is referenced by another task; it was preserved".into(),
            );
        }
        super::dependencies::cleanup(&path)?;
        if record.draft.provider == Provider::Hermes {
            receipt.identifier.clear();
        }
        Ok::<_, String>(())
    })();
    receipt.state = if result.is_ok() {
        "uninstalled"
    } else {
        "uninstall_failed"
    }
    .into();
    receipt.error = result.as_ref().err().cloned();
    write_receipt(record, &receipt)?;
    result
}

fn recover_update(
    state: &Path,
    record: &ManagedAutomation,
) -> Result<Option<ManagedAutomation>, String> {
    let path = checked(state, record)?;
    if !["updating", "update_failed"].contains(&receipt(record)?.state.as_str()) {
        return Ok(None);
    }
    let snapshot: UpdateSnapshot = super::storage::json(&path.join(".local/operation.json"))?;
    if snapshot.record.id != record.id
        || snapshot.record.draft.script_dir != record.draft.script_dir
    {
        return Err("Recovery journal does not match this task".into());
    }
    super::storage::materialize(
        &snapshot.record,
        snapshot.manifest.dependencies,
        snapshot.manifest.hermes,
    )?;
    let mut restored = snapshot.receipt;
    restored.state = "install_failed".into();
    restored.error =
        Some("Interrupted update was restored; retry installation or uninstall the task".into());
    write_receipt(&snapshot.record, &restored)?;
    fs::remove_file(path.join(".local/operation.json")).map_err(|e| e.to_string())?;
    Ok(Some(snapshot.record))
}

pub(in crate::core::automation) fn remove(id: &str, delete_data: bool) -> Result<(), String> {
    let state = store::root();
    let _lock = lock(&state, id)?;
    let record = find(&state, id)?;
    let path = checked(&state, &record)?;
    uninstall_at(&state, &record)?;
    if !delete_data {
        let journal = state
            .join("deletions")
            .join(format!("{}.json", id.trim_start_matches("agent_hub:")));
        json_write(
            &journal,
            &serde_json::json!({"id": id, "path": path, "preserved": true}),
        )?;
        let mut receipt = receipt(&record)?;
        receipt.archived = true;
        write_receipt(&record, &receipt)?;
        notify();
        return Ok(());
    }
    let registry = store::read_registry(&state)?;
    for other in registry.tasks.iter() {
        if other.id != id
            && [&other.draft.script_dir, &other.draft.workdir]
                .into_iter()
                .flatten()
                .any(|p| crate::core::path_guard::is_path_safe(&path, Path::new(p)))
        {
            return Err(
                "Task package is referenced by another task; its files were preserved".into(),
            );
        }
    }
    let report = super::super::overview(None);
    if report
        .tasks
        .iter()
        .filter(|task| task.id != id)
        .filter_map(|task| task.project.as_ref())
        .any(|p| crate::core::path_guard::is_path_safe(&path, Path::new(p)))
    {
        return Err(
            "Task package is referenced by another system task; files were preserved".into(),
        );
    }
    if record
        .draft
        .workdir
        .as_ref()
        .is_some_and(|p| crate::core::path_guard::is_path_safe(&path, Path::new(p)))
    {
        return Err("Task package contains the selected project; its files were preserved".into());
    }
    let journal = state
        .join("deletions")
        .join(format!("{}.json", id.trim_start_matches("agent_hub:")));
    json_write(&journal, &serde_json::json!({"id": id, "path": path}))?;
    let mut receipt = receipt(&record)?;
    receipt.removal_pending = true;
    write_receipt(&record, &receipt)?;
    checked(&state, &record)?;
    fs::remove_dir_all(&path)
        .map_err(|e| format!("Task uninstalled; retry deleting local data: {e}"))?;
    notify();
    Ok(())
}
