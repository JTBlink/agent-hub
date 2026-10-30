//! Revision-checked updates retain a durable previous package for recovery.
use super::super::Provider;
use super::creation::create;
use super::lifecycle::{block, install_at, notify};
use super::*;
use std::fs;

pub(in crate::core::automation) fn save(
    id: Option<&str>,
    revision: Option<u64>,
    mut draft: AutomationDraft,
) -> Result<String, String> {
    let state = store::root();
    let Some(id) = id else {
        return create(&state, draft, Vec::new(), true);
    };
    let _lock = lock(&state, id)?;
    let old = find(&state, id)?;
    let path = checked(&state, &old)?;
    if Some(old.revision) != revision {
        return Err("Task changed; refresh before saving".into());
    }
    if old.draft.provider != draft.provider {
        return Err("Cannot change task scheduler".into());
    }
    if draft.script_dir.is_none() {
        draft.script_dir = old.draft.script_dir.clone();
    }
    if draft.package_options.is_none() {
        draft.package_options = old.draft.package_options.clone();
    }
    if draft.files.is_empty() && draft.content == old.draft.content {
        draft.files = old.draft.files.clone();
    }
    if draft.provider == Provider::System {
        super::exchange::normalize(&mut draft);
    }
    draft.validate()?;
    if draft.script_dir != old.draft.script_dir {
        return Err("Task package directories cannot be moved while editing".into());
    }
    let mut receipt = receipt(&old)?;
    if receipt.removal_pending {
        return Err("Task deletion is pending; retry deletion".into());
    }
    if !["installed", "uninstalled"].contains(&receipt.state.as_str()) {
        return Err("Finish or retry installation/uninstallation before editing".into());
    }
    let mut next = old.clone();
    next.draft = draft;
    next.draft.validate()?;
    let mut portable = next.draft.clone();
    portable.workdir = None;
    portable.script_dir = None;
    let options = portable.package_options.take().unwrap_or(PackageOptions {
        version: None,
        dependencies: Vec::new(),
        hermes: None,
    });
    super::exchange::AutomationPackage {
        version: options.version,
        schema_version: 1,
        shell: super::super::command_shell().into(),
        draft: portable,
        dependencies: options.dependencies,
        hermes: options.hermes,
    }
    .validate()?;
    next.revision = old
        .revision
        .checked_add(1)
        .ok_or("Automation revision exhausted")?;
    let installed = receipt.state == "installed";
    if installed {
        block(&path, &old)?;
    }
    let manifest: Manifest = super::storage::json(&path.join("task.json"))?;
    json_write(
        &path.join(".local/operation.json"),
        &UpdateSnapshot {
            record: old.clone(),
            receipt: receipt.clone(),
            manifest: manifest.clone(),
        },
    )?;
    receipt.state = "updating".into();
    write_receipt(&old, &receipt)?;
    let result = (|| {
        if installed {
            if old.draft.provider == Provider::System {
                detach(&old)?;
            } else {
                super::registration::adapter(old.draft.provider).apply(
                    &state,
                    &mut old.clone(),
                    false,
                )?;
            }
        }
        let options = next
            .draft
            .package_options
            .clone()
            .unwrap_or(PackageOptions {
                version: None,
                dependencies: Vec::new(),
                hermes: None,
            });
        super::storage::materialize(&next, options.dependencies, options.hermes)?;
        receipt.revision = next.revision;
        receipt.fingerprint = super::storage::fingerprint(&next.draft)?;
        receipt.pending_backup = true;
        receipt.state = "uninstalled".into();
        write_receipt(&next, &receipt)?;
        if installed {
            install_at(&state, &next)?;
        }
        Ok::<_, String>(())
    })();
    if let Err(error) = result {
        let rollback = (|| {
            super::storage::materialize(&old, manifest.dependencies, manifest.hermes)?;
            receipt.revision = old.revision;
            receipt.fingerprint = super::storage::fingerprint(&old.draft)?;
            receipt.state = "uninstalled".into();
            write_receipt(&old, &receipt)?;
            if installed {
                install_at(&state, &old)?;
            }
            Ok::<_, String>(())
        })();
        if let Err(ref failure) = rollback {
            receipt.state = "update_failed".into();
            receipt.error = Some(format!("{error}; previous task restoration: {failure}"));
            write_receipt(&old, &receipt)?;
        } else {
            fs::remove_file(path.join(".local/operation.json")).map_err(|e| e.to_string())?;
        }
        return Err(format!("{error}; previous task restoration: {rollback:?}"));
    }
    fs::remove_file(path.join(".local/operation.json")).map_err(|e| e.to_string())?;
    notify();
    Ok(id.into())
}

fn detach(record: &ManagedAutomation) -> Result<(), String> {
    super::registration::adapter(record.draft.provider).remove(&store::root(), record)
}
