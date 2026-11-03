use crate::core::{
    error::AppError,
    install_cancel::InstallCancelRegistry,
    skill_store::SkillStore,
    task_browser::{
        self, Binding, Filters, SystemCli, TaskClient, TaskDetail, TaskFailure, TaskKind, TaskPage,
    },
};
use std::sync::Arc;
use tauri::{State, Webview};

#[tauri::command]
pub async fn task_bindings(
    store: State<'_, Arc<SkillStore>>,
    refresh: Option<bool>,
) -> Result<Vec<Binding>, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if refresh.unwrap_or(false) {
            task_browser::refresh_bindings(&store)
        } else {
            task_browser::bindings(&store)
        }
        .map_err(AppError::db)
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
) -> Result<Vec<task_browser::RemoteCandidate>, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        task_browser::remote_candidates(&store, &project_id).map_err(AppError::io)
    })
    .await?
}
fn request_key(window: &Webview, id: &str) -> Result<String, TaskFailure> {
    uuid::Uuid::parse_str(id)
        .map_err(|_| TaskFailure::new("invalid_input", "Invalid query identity"))?;
    Ok(format!("tasks:{}:{id}", window.label()))
}
fn client(store: &SkillStore, id: &str) -> Result<(Binding, TaskClient<SystemCli>), TaskFailure> {
    let binding = task_browser::binding(store, id)?.ok_or_else(|| {
        TaskFailure::new("not_connected", "Repository binding is no longer available")
    })?;
    let cwd = crate::core::project_paths::project_directory(store, &binding.project_id)?;
    Ok((binding, TaskClient::new(SystemCli { cwd })))
}
#[tauri::command]
pub async fn task_list(
    window: Webview,
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
    window: Webview,
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
    window: Webview,
    registry: State<'_, Arc<InstallCancelRegistry>>,
    request_id: String,
) -> Result<(), TaskFailure> {
    registry.cancel(&request_key(&window, &request_id)?);
    Ok(())
}

#[tauri::command]
pub async fn task_update_issue(
    store: State<'_, Arc<SkillStore>>,
    binding_id: String,
    number: u64,
    change: task_browser::IssueStateChange,
) -> Result<task_browser::TaskSummary, TaskFailure> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (binding, client) = client(&store, &binding_id)?;
        client.update_issue(&binding, number, &change)
    })
    .await
    .map_err(|error| TaskFailure::new("internal", error.to_string()))?
}

#[tauri::command]
pub async fn task_add_comment(
    store: State<'_, Arc<SkillStore>>,
    binding_id: String,
    kind: TaskKind,
    number: u64,
    body: String,
) -> Result<task_browser::TaskComment, TaskFailure> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (binding, client) = client(&store, &binding_id)?;
        client.add_comment(&binding, kind, number, &body)
    })
    .await
    .map_err(|error| TaskFailure::new("internal", error.to_string()))?
}

#[tauri::command]
pub async fn task_prepare_herdr_workspace(
    window: Webview,
    store: State<'_, Arc<SkillStore>>,
    tools: State<'_, Arc<crate::core::herdr::tools::HerdrTools>>,
    project_id: String,
    path: String,
) -> Result<crate::core::herdr::control::OpenedWorkspace, AppError> {
    super::terminal::owner(&window)?;
    let store = store.inner().clone();
    let tools = tools.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let installation = tools
            .detect()
            .map_err(AppError::io)?
            .ok_or_else(|| AppError::not_found("Install Herdr before starting a task"))?;
        task_browser::prepare_managed_workspace(
            &store,
            std::path::Path::new(&installation.path),
            &project_id,
            &path,
        )
        .map_err(AppError::io)
    })
    .await?
}
