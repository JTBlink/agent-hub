use std::sync::Arc;

use agent_hub_core::skill_source::{
    valid_source_id, SkillSearchPage, SkillSource, SkillSourceRegistry, SkillVersion,
};
use tauri::State;

use super::{
    log_install_outcome, store_installed_skill_unlocked, AppError, InstallSourceMetadata, RepoLock,
    SkillStore,
};
use crate::core::installer;

/// Install a chosen catalog version and register it in the managed library.
///
/// A trusted plugin runs this off the UI thread after validating its caller.
/// The provider key is a stable, non-secret identifier for the plugin.
/// This adds a separate library entry when a name is already in use.
pub fn install_catalog_skill(
    store: &SkillStore,
    source: &dyn SkillSource,
    source_id: &str,
    skill_id: &str,
    version: &SkillVersion,
    name: Option<&str>,
) -> Result<String, AppError> {
    if !valid_source_id(source_id) {
        return Err(AppError::invalid_input("Invalid skill catalog ID"));
    }
    let outcome = (|| {
        let prepared = installer::prepare_skill_from_source(source, skill_id, version)
            .map_err(AppError::io)?;
        let _lock = RepoLock::acquire_foreground("install catalog skill").map_err(AppError::db)?;
        let result = prepared
            .install_as_new_library_skill(skill_id, name, |path| {
                Ok(store
                    .get_skill_by_central_path(&path.to_string_lossy())?
                    .is_some())
            })
            .map_err(AppError::io)?;
        let metadata = InstallSourceMetadata {
            source_type: "catalog".into(),
            source_ref: Some(source_id.into()),
            source_ref_resolved: None,
            source_subpath: Some(skill_id.into()),
            source_branch: None,
            source_revision: Some(version.version.clone()),
            source_agent: None,
            remote_revision: None,
            update_status: "unknown".into(),
        };
        let id =
            store_installed_skill_unlocked(store, &result, &metadata, None).inspect_err(|_| {
                // Metadata publication can fail after the row commits. Retain files
                // when the database owns them or the commit cannot be determined.
                if matches!(
                    store.get_skill_by_central_path(&result.central_path.to_string_lossy()),
                    Ok(None)
                ) {
                    if let Err(error) = std::fs::remove_dir_all(&result.central_path) {
                        log::warn!("Failed to clean up unregistered catalog skill: {error}");
                    }
                }
            })?;
        Ok((id, result.name))
    })();
    log_install_outcome(store, "catalog", outcome.as_ref());
    outcome.map(|(id, _)| id)
}

fn registered_source(
    registry: &SkillSourceRegistry,
    id: &str,
) -> Result<Arc<dyn SkillSource>, AppError> {
    registry
        .get(id)
        .map_err(AppError::io)?
        .ok_or_else(|| AppError::not_found("Skill catalog is not registered"))
}

#[tauri::command]
pub async fn skill_catalog_search(
    source_id: String,
    query: String,
    cursor: Option<String>,
    registry: State<'_, SkillSourceRegistry>,
) -> Result<SkillSearchPage, AppError> {
    let source = registered_source(&registry, &source_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        source
            .search(&query, cursor.as_deref())
            .map_err(|_| AppError::io("Could not search skill catalog"))
    })
    .await?
}

#[tauri::command]
pub async fn skill_catalog_versions(
    source_id: String,
    skill_id: String,
    registry: State<'_, SkillSourceRegistry>,
) -> Result<Vec<SkillVersion>, AppError> {
    let source = registered_source(&registry, &source_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        source
            .versions(&skill_id)
            .map_err(|_| AppError::io("Could not list catalog skill versions"))
    })
    .await?
}

#[tauri::command]
pub async fn skill_catalog_install(
    source_id: String,
    skill_id: String,
    version: String,
    name: Option<String>,
    registry: State<'_, SkillSourceRegistry>,
    store: State<'_, Arc<SkillStore>>,
) -> Result<String, AppError> {
    let source = registered_source(&registry, &source_id)?;
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        // Take checksum metadata from the provider, never the WebView.
        let versions = source
            .versions(&skill_id)
            .map_err(|_| AppError::io("Could not list catalog skill versions"))?;
        let mut matching = versions.iter().filter(|entry| entry.version == version);
        let entry = matching
            .next()
            .ok_or_else(|| AppError::not_found("Catalog skill version not found"))?;
        if matching.next().is_some() {
            return Err(AppError::io("Catalog returned duplicate skill versions"));
        }
        install_catalog_skill(
            &store,
            source.as_ref(),
            &source_id,
            &skill_id,
            entry,
            name.as_deref(),
        )
    })
    .await?
}
