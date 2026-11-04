//! Prepare a complete independent package before registering any schedule.
use super::super::{managed, Provider};
use super::lifecycle::{notify, prepare_at};
use super::*;
use std::fs;

/// Create a usable task; setup is part of saving, never a separate user action.
pub(super) fn create(
    state: &Path,
    draft: AutomationDraft,
    dependencies: Vec<Dependency>,
) -> Result<String, String> {
    let id = stage(state, draft, dependencies)?;
    let _lock = lock(state, &id)?;
    let record = find(state, &id)?;
    prepare_at(state, &record).map_err(|e| {
        format!(
            "Task {id} was saved; runtime preparation failed. Edit or run this task to retry: {e}"
        )
    })?;
    Ok(id)
}

/// Stage files before touching a scheduler (also used by migration rollback).
pub(super) fn stage(
    state: &Path,
    draft: AutomationDraft,
    dependencies: Vec<Dependency>,
) -> Result<String, String> {
    stage_identity(state, draft, dependencies, None, None)
}

pub(super) fn stage_identity(
    state: &Path,
    mut draft: AutomationDraft,
    mut dependencies: Vec<Dependency>,
    hermes: Option<HermesScripts>,
    identity: Option<&str>,
) -> Result<String, String> {
    let mut version = None;
    let hermes = if let Some(options) = draft.package_options.take() {
        if !dependencies.is_empty() || hermes.is_some() {
            return Err("Task runtime requirements were declared twice".into());
        }
        version = options.version;
        dependencies = options.dependencies;
        options.hermes
    } else {
        hermes
    };
    if draft.script_dir.is_some() {
        return Err("New task packages allocate an independent script directory; use workdir for the project".into());
    }
    draft.validate()?;
    if draft.provider == Provider::System {
        super::exchange::normalize(&mut draft);
    }
    draft.validate()?;
    if draft.files.iter().any(|f| f.path.ends_with(".py"))
        && !dependencies
            .iter()
            .any(|d| matches!(d, Dependency::Python { .. }))
    {
        dependencies.push(Dependency::Python {
            packages: Vec::new(),
        });
    }
    super::dependencies::validate(&dependencies)?;
    if draft.files.iter().any(|file| {
        file.content == include_str!("../../../../../automations/_shared/herdr-agent.py")
    }) && !dependencies
        .iter()
        .any(|dependency| matches!(dependency, Dependency::Command { name } if name == "herdr"))
    {
        dependencies.push(Dependency::Command {
            name: "herdr".into(),
        });
    }
    let mut portable = draft.clone();
    portable.workdir = None;
    portable.script_dir = None;
    super::exchange::AutomationPackage {
        version: version.clone(),
        schema_version: 1,
        shell: super::super::command_shell().into(),
        draft: portable,
        dependencies: dependencies.clone(),
        hermes: hermes.clone(),
    }
    .validate()?;
    if version.is_some() || !dependencies.is_empty() || hermes.is_some() {
        draft.package_options = Some(PackageOptions {
            version,
            dependencies: dependencies.clone(),
            hermes: hermes.clone(),
        });
    }
    let id = identity
        .map(str::to_owned)
        .unwrap_or_else(|| format!("agent_hub:{}", uuid::Uuid::new_v4()));
    let _lock = if identity.is_none() {
        Some(lock(state, &id)?)
    } else {
        None
    };
    let root = root(state);
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    super::storage::regular_directory(&root)?;
    let path = super::super::workspace::allocate(&root, &draft.name)?;
    fs::create_dir(path.join(".local")).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
        fs::set_permissions(path.join(".local"), fs::Permissions::from_mode(0o700))
            .map_err(|e| e.to_string())?;
    }
    store::write(&path.join(".local/managed"), b"1")?;
    draft.script_dir = Some(path.to_string_lossy().into_owned());
    let record = if draft.provider == Provider::System {
        managed::native_record(state, id.clone(), draft, 1)?
    } else {
        ManagedAutomation {
            id: id.clone(),
            revision: 1,
            draft,
            source: "hermes".into(),
            identifier: String::new(),
            location: super::super::hermes_manage::home()?
                .join("cron/jobs.json")
                .to_string_lossy()
                .into_owned(),
        }
    };
    // Publish the manifest last, once the private receipt and files exist.
    json_write(
        &path.join(".local/receipt.json"),
        &Receipt {
            revision: 1,
            source: record.source.clone(),
            identifier: record.identifier.clone(),
            location: record.location.clone(),
            state: "pending".into(),
            error: None,
            fingerprint: super::storage::fingerprint(&record.draft)?,
            pending_backup: true,
            removal_pending: false,
            archived: false,
        },
    )?;
    super::storage::materialize(&record, dependencies, hermes)?;
    notify();
    Ok(id)
}
