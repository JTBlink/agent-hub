//! Independent task packages. Portable intent and local installation evidence
//! live in separate files; a damaged package cannot hide another package.
pub mod catalog;
mod creation;
mod dependencies;
mod exchange;
mod hermes_bridge;
mod lifecycle;
mod migration;
mod privileged;
mod registration;
mod storage;
#[cfg(test)]
mod tests;
mod update;

pub(super) use exchange::normalize;
pub use exchange::{
    export_package, import_definition, import_package, preview_package, AutomationPackage,
};
pub(super) use lifecycle::remove;
pub use lifecycle::{install, uninstall};
pub use migration::migrate;
pub(super) use storage::fingerprint as storage_fingerprint;
pub(super) use storage::{discover, read, write_receipt};
pub(super) use update::save;

use super::{definition::valid_id, store, AutomationDraft, ManagedAutomation};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Dependency {
    Command { name: String },
    Python { packages: Vec<String> },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct HermesScripts {
    pub script: Option<String>,
    pub monitor_script: Option<String>,
    #[serde(default)]
    pub no_agent: bool,
}

/// Optional install requirements travel with GUI/CLI draft snapshots and backups.
/// On disk they have a single home in the package manifest.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PackageOptions {
    #[serde(default)]
    pub dependencies: Vec<Dependency>,
    pub hermes: Option<HermesScripts>,
}

pub(super) fn validate_options(options: &PackageOptions) -> Result<(), String> {
    dependencies::validate(&options.dependencies)
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Manifest {
    schema_version: u32,
    #[serde(default)]
    instance_id: String,
    shell: String,
    draft: AutomationDraft,
    files: Vec<String>,
    #[serde(default)]
    dependencies: Vec<Dependency>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    hermes: Option<HermesScripts>,
}

#[derive(Clone, Serialize, Deserialize)]
pub(super) struct Receipt {
    pub revision: u64,
    pub source: String,
    pub identifier: String,
    pub location: String,
    pub state: String,
    pub error: Option<String>,
    pub fingerprint: String,
    pub pending_backup: bool,
    #[serde(default)]
    pub removal_pending: bool,
    #[serde(default)]
    pub archived: bool,
}

#[derive(Clone, Serialize, Deserialize)]
pub(super) struct Binding {
    pub workdir: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub(super) struct UpdateSnapshot {
    pub record: ManagedAutomation,
    pub receipt: Receipt,
    pub manifest: Manifest,
}

/// No user-chosen directories are adopted as packages: only the managed root
/// is searched, one level deep. Explicit old directories remain legacy tasks.
pub(super) fn root(state: &Path) -> PathBuf {
    #[cfg(test)]
    {
        state.join("workspaces")
    }
    #[cfg(not(test))]
    {
        if state == store::root() {
            super::workspace::workspace_root()
        } else {
            state.join("workspaces")
        }
    }
}

pub(super) fn directory(record: &ManagedAutomation) -> Option<PathBuf> {
    let path = PathBuf::from(record.draft.script_dir.as_ref()?);
    let identity = storage::json::<Manifest>(&path.join("task.json"))
        .map(|m| m.instance_id)
        .or_else(|_| {
            storage::json::<UpdateSnapshot>(&path.join(".local/operation.json"))
                .map(|s| s.record.id)
        })
        .ok()?;
    (valid_id(&record.id) && identity == record.id).then_some(path)
}

pub(super) fn checked(state: &Path, record: &ManagedAutomation) -> Result<PathBuf, String> {
    let path = directory(record).ok_or("Missing or invalid task package")?;
    let root = root(state);
    if path.parent() != Some(root.as_path()) {
        return Err("Task package is outside its managed root".into());
    }
    crate::core::path_guard::ensure_dir_within_root(&path, &root).map_err(|e| e.to_string())?;
    storage::regular_directory(&path)?;
    storage::regular_directory(&path.join(".local"))?;
    super::managed::verify(state, record)?;
    Ok(path)
}

pub(super) fn receipt(record: &ManagedAutomation) -> Result<Receipt, String> {
    storage::json(
        &directory(record)
            .ok_or("Missing task package")?
            .join(".local/receipt.json"),
    )
}

pub(super) fn lock(state: &Path, id: &str) -> Result<store::Lock, String> {
    if !valid_id(id) {
        return Err("Invalid task instance ID".into());
    }
    store::Lock::acquire(
        &state
            .join("operations")
            .join(id.trim_start_matches("agent_hub:")),
    )
}

pub(super) fn find(state: &Path, id: &str) -> Result<ManagedAutomation, String> {
    discover(state)
        .0
        .into_iter()
        .find(|record| record.id == id)
        .ok_or_else(|| "Task package not found or damaged; inspect the automation list".into())
}

pub(super) fn json_write(path: &Path, value: &impl Serialize) -> Result<(), String> {
    store::write(
        path,
        &serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?,
    )
}

pub(super) fn state(record: &ManagedAutomation) -> Option<String> {
    directory(record)?;
    Some(
        receipt(record)
            .map(|r| r.state)
            .unwrap_or_else(|_| "install_failed".into()),
    )
}

pub(super) fn is_package_draft(draft: &AutomationDraft) -> bool {
    draft
        .script_dir
        .as_ref()
        .is_some_and(|path| Path::new(path).join("task.json").is_file())
}

pub fn create_uninstalled(draft: AutomationDraft) -> Result<String, String> {
    lifecycle::create(&store::root(), draft, Vec::new(), false)
}
