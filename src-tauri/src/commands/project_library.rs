//! Desktop adapter for portable project Skills operations.
use crate::core::{
    error::AppError,
    project_library::{self, ProjectLibraryStatus},
    skill_store::{ProjectRecord, SkillStore},
    tool_adapters,
};
use std::{path::Path, sync::Arc};
use tauri::State;

fn project(store: &SkillStore, id: &str) -> Result<ProjectRecord, AppError> {
    let record = store
        .get_project_by_id(id)
        .map_err(AppError::db)?
        .ok_or_else(|| AppError::not_found("Project not found"))?;
    if record.workspace_type == "linked" {
        return Err(AppError::invalid_input(
            "Linked workspaces do not use a team project library",
        ));
    }
    Ok(record)
}

#[tauri::command]
pub async fn get_project_library_status(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
) -> Result<ProjectLibraryStatus, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let record = project(&store, &project_id)?;
        project_library::status(Path::new(&record.path))
    })
    .await?
}

#[tauri::command]
pub async fn repair_project_library_skill(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    directory: String,
) -> Result<ProjectLibraryStatus, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let record = project(&store, &project_id)?;
        project_library::repair(Path::new(&record.path), &directory)
    })
    .await?
}

#[tauri::command]
pub async fn deploy_project_library_skill(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    directory: String,
    agents: Vec<String>,
) -> Result<ProjectLibraryStatus, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let record = project(&store, &project_id)?;
        let targets = agents
            .iter()
            .map(|key| {
                tool_adapters::find_adapter_with_store(&store, key)
                    .ok_or_else(|| AppError::not_found(format!("Unknown agent: {key}")))
            })
            .collect::<Result<Vec<_>, _>>()?;
        project_library::deploy(Path::new(&record.path), &directory, &targets)
    })
    .await?
}

#[tauri::command]
pub async fn remove_project_library_skill(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    directory: String,
) -> Result<ProjectLibraryStatus, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let record = project(&store, &project_id)?;
        project_library::remove(Path::new(&record.path), &directory)
    })
    .await?
}
