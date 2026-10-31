use crate::core::{
    error::AppError,
    install_cancel::InstallCancelRegistry,
    skill_store::SkillStore,
    task_browser::{
        self, Binding, Filters, SystemCli, TaskClient, TaskDetail, TaskFailure, TaskKind, TaskPage,
    },
};
use std::sync::Arc;
use tauri::{State, WebviewWindow};

#[tauri::command]
pub async fn task_bindings(store: State<'_, Arc<SkillStore>>) -> Result<Vec<Binding>, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        task_browser::bindings(&store).map_err(AppError::db)
    })
    .await?
}
#[tauri::command]
pub async fn task_save_binding(
    store: State<'_, Arc<SkillStore>>,
    binding: Binding,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        task_browser::save_binding(&store, binding).map_err(AppError::io)
    })
    .await?
}
#[tauri::command]
pub async fn task_remove_binding(
    store: State<'_, Arc<SkillStore>>,
    id: String,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        task_browser::remove_binding(&store, &id).map_err(AppError::db)
    })
    .await?
}
#[tauri::command]
pub async fn task_project_remotes(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
) -> Result<Vec<String>, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        task_browser::remotes(&store, &project_id).map_err(AppError::io)
    })
    .await?
}
fn request_key(window: &WebviewWindow, id: &str) -> Result<String, TaskFailure> {
    uuid::Uuid::parse_str(id)
        .map_err(|_| TaskFailure::new("invalid_input", "Invalid query identity"))?;
    Ok(format!("tasks:{}:{id}", window.label()))
}
fn client(store: &SkillStore, id: &str) -> Result<(Binding, TaskClient<SystemCli>), TaskFailure> {
    let binding = task_browser::bindings(store)?
        .into_iter()
        .find(|binding| binding.id == id)
        .ok_or_else(|| {
            TaskFailure::new("not_connected", "Repository binding is no longer available")
        })?;
    let cwd = crate::core::project_paths::project_directory(store, &binding.project_id)?;
    Ok((binding, TaskClient::new(SystemCli { cwd })))
}
#[tauri::command]
pub async fn task_list(
    window: WebviewWindow,
    store: State<'_, Arc<SkillStore>>,
    registry: State<'_, Arc<InstallCancelRegistry>>,
    binding_id: String,
    filters: Filters,
    page: u32,
    request_id: String,
) -> Result<TaskPage, TaskFailure> {
    let key = request_key(&window, &request_id)?;
    let registry = registry.inner().clone();
    let cancel = registry.register(&key);
    let store = store.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let (binding, client) = client(&store, &binding_id)?;
        client.list(&binding, &filters, page, &cancel)
    })
    .await
    .map_err(|error| TaskFailure::new("internal", error.to_string()));
    registry.remove(&key);
    result?
}
#[derive(serde::Deserialize)]
pub struct DetailQuery {
    binding_id: String,
    kind: TaskKind,
    number: u64,
    comments_page: u32,
    request_id: String,
}
#[tauri::command]
pub async fn task_detail(
    window: WebviewWindow,
    store: State<'_, Arc<SkillStore>>,
    registry: State<'_, Arc<InstallCancelRegistry>>,
    query: DetailQuery,
) -> Result<TaskDetail, TaskFailure> {
    let key = request_key(&window, &query.request_id)?;
    let registry = registry.inner().clone();
    let cancel = registry.register(&key);
    let store = store.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let (binding, client) = client(&store, &query.binding_id)?;
        client.detail(
            &binding,
            query.kind,
            query.number,
            query.comments_page,
            &cancel,
        )
    })
    .await
    .map_err(|error| TaskFailure::new("internal", error.to_string()));
    registry.remove(&key);
    result?
}
#[tauri::command]
pub fn task_cancel(
    window: WebviewWindow,
    registry: State<'_, Arc<InstallCancelRegistry>>,
    request_id: String,
) -> Result<(), TaskFailure> {
    registry.cancel(&request_key(&window, &request_id)?);
    Ok(())
}
