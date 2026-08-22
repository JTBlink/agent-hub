use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use serde::Serialize;
use tauri::Manager;

use agents::{claude::ClaudeCodeAdapter, AgentConfigAdapter, ConfigDocument, ScanContext};
use persistence::{StorageDiagnosticsRepository, WorkspaceRepository};

pub mod agents;
pub mod configuration;
pub mod diagnostics;
pub mod domain;
pub mod logging;
pub mod persistence;
pub mod skill_installation;
pub mod skills;

pub use domain::{Agent, ConfigFormat, InstallationState, ParseStatus, Scope, SkillKind};

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    name: &'static str,
    version: &'static str,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "AgentHub",
        version: env!("CARGO_PKG_VERSION"),
    }
}

struct AppState {
    workspaces: Arc<dyn WorkspaceRepository>,
    storage_diagnostics: Arc<dyn StorageDiagnosticsRepository>,
    authorized_config_paths: Mutex<HashSet<PathBuf>>,
    backup_root: PathBuf,
}

impl AppState {
    fn new(
        workspaces: Arc<dyn WorkspaceRepository>,
        storage_diagnostics: Arc<dyn StorageDiagnosticsRepository>,
        backup_root: PathBuf,
    ) -> Self {
        Self {
            workspaces,
            storage_diagnostics,
            authorized_config_paths: Mutex::new(HashSet::new()),
            backup_root,
        }
    }

    fn authorize(&self, document: &ConfigDocument) -> Result<(), String> {
        self.authorized_config_paths
            .lock()
            .map_err(|_| "configuration authorization lock is unavailable".to_owned())?
            .insert(document.path.clone());
        Ok(())
    }

    fn ensure_authorized(&self, path: &Path) -> Result<(), String> {
        let authorized = self
            .authorized_config_paths
            .lock()
            .map_err(|_| "configuration authorization lock is unavailable".to_owned())?;
        if authorized.contains(path) {
            Ok(())
        } else {
            Err("configuration path must be discovered before it can be edited".into())
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceScanResult {
    workspace: persistence::WorkspaceRecord,
    configs: Vec<ConfigDocument>,
    skills: skills::SkillInventory,
    instructions: Vec<InstructionFile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstructionFile {
    path: String,
    kind: String,
    scope: Scope,
}

fn discover_instruction_files(root: &Path) -> Vec<InstructionFile> {
    fn visit(directory: &Path, depth: usize, found: &mut Vec<InstructionFile>) {
        if depth > 16 {
            return;
        }
        let Ok(entries) = std::fs::read_dir(directory) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                visit(&path, depth + 1, found);
                continue;
            }
            let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            let kind = match name {
                "AGENTS.md" | "AGENTS.override.md" => "agents",
                "CLAUDE.md" | "CLAUDE.local.md" => "claude",
                _ => continue,
            };
            found.push(InstructionFile {
                path: path.to_string_lossy().into_owned(),
                kind: kind.to_owned(),
                scope: Scope::Workspace,
            });
        }
    }
    let mut found = Vec::new();
    visit(root, 0, &mut found);
    found.sort_by(|left, right| left.path.cmp(&right.path));
    found
}

fn workspace_input(path: &str) -> Result<persistence::NewWorkspace, String> {
    let entered_path = path.trim();
    if entered_path.is_empty() {
        return Err("workspace path cannot be empty".into());
    }
    let entered = PathBuf::from(entered_path);
    let metadata = std::fs::symlink_metadata(&entered)
        .map_err(|error| format!("workspace path is unavailable: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("workspace path must be a real directory, not a symlink".into());
    }
    let canonical = entered
        .canonicalize()
        .map_err(|error| format!("workspace path cannot be canonicalized: {error}"))?;
    let normalized_path = canonical.to_string_lossy().into_owned();
    let display_name = canonical
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("Workspace")
        .to_owned();
    Ok(persistence::NewWorkspace {
        display_name,
        entered_path: entered_path.to_owned(),
        normalized_path: normalized_path.clone(),
        canonical_path: Some(normalized_path),
    })
}

#[tauri::command]
fn list_workspaces(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<persistence::WorkspaceRecord>, String> {
    state
        .workspaces
        .list_workspaces()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn add_workspace(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<persistence::WorkspaceRecord, String> {
    let workspace = workspace_input(&path)?;
    let id = state
        .workspaces
        .add_workspace(&workspace)
        .map_err(|error| error.to_string())?;
    state
        .workspaces
        .list_workspaces()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|item| item.id == id)
        .ok_or_else(|| "workspace was added but could not be loaded".to_owned())
}

#[tauri::command]
fn remove_workspace(workspace_id: i64, state: tauri::State<'_, AppState>) -> Result<bool, String> {
    state
        .workspaces
        .remove_workspace(workspace_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn scan_workspace(
    app: tauri::AppHandle,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<WorkspaceScanResult, String> {
    let workspace = workspace_input(&path)?;
    let root = PathBuf::from(&workspace.normalized_path);
    let configs = vec![
        ClaudeCodeAdapter.scan_workspace(&root),
        agents::standard::CodexAdapter.scan_workspace(&root),
        agents::standard::OpenCodeAdapter.scan_workspace(&root),
    ];
    for document in &configs {
        state.authorize(document)?;
    }
    let indexes = configs
        .iter()
        .map(|document| persistence::ConfigIndex {
            agent: document.agent,
            scope: document.scope,
            normalized_path: document.path.to_string_lossy().into_owned(),
            format: document.format,
            checksum: document.checksum.clone().unwrap_or_default(),
            parse_status: match document.status {
                agents::ConfigStatus::Ready => ParseStatus::Valid,
                agents::ConfigStatus::Invalid => ParseStatus::Invalid,
                agents::ConfigStatus::Missing => ParseStatus::Missing,
                agents::ConfigStatus::Unreadable => ParseStatus::Unreadable,
            },
        })
        .collect::<Vec<_>>();
    let workspace_id = state
        .workspaces
        .replace_workspace_scan(&workspace, &indexes)
        .map_err(|error| error.to_string())?;
    let workspace_record = state
        .workspaces
        .list_workspaces()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|item| item.id == workspace_id)
        .ok_or_else(|| "workspace scan completed but record could not be loaded".to_owned())?;
    let home_directory = app.path().home_dir().map_err(|error| error.to_string())?;
    let inventory = skills::scan_installed_skills(home_directory, Some(&root));
    Ok(WorkspaceScanResult {
        workspace: workspace_record,
        configs,
        skills: inventory,
        instructions: discover_instruction_files(&root),
    })
}

#[tauri::command]
fn storage_diagnostics(
    state: tauri::State<'_, AppState>,
) -> Result<persistence::DatabaseDiagnostics, String> {
    match state.storage_diagnostics.diagnostics() {
        Ok(diagnostics) => Ok(diagnostics),
        Err(error) => {
            logging::command_failed(
                logging::Command::StorageDiagnostics,
                logging::FailureCode::Persistence,
            );
            Err(error.to_string())
        }
    }
}

#[tauri::command]
fn scan_claude_global(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<ConfigDocument, String> {
    let home_directory = app
        .path()
        .home_dir()
        .map_err(|error| format!("could not resolve the user home directory: {error}"))?;
    let context = ScanContext::from_environment(home_directory);
    let document = ClaudeCodeAdapter.scan_global(&context);
    state.authorize(&document)?;
    Ok(document)
}

#[tauri::command]
fn scan_codex_global(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<ConfigDocument, String> {
    let home_directory = app.path().home_dir().map_err(|error| error.to_string())?;
    let document = agents::standard::CodexAdapter.scan_global(&ScanContext::new(home_directory));
    state.authorize(&document)?;
    Ok(document)
}

#[tauri::command]
fn scan_opencode_global(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<ConfigDocument, String> {
    let home_directory = app.path().home_dir().map_err(|error| error.to_string())?;
    let document = agents::standard::OpenCodeAdapter.scan_global(&ScanContext::new(home_directory));
    state.authorize(&document)?;
    Ok(document)
}

#[tauri::command]
fn scan_skills(
    app: tauri::AppHandle,
    workspace_directory: Option<String>,
) -> Result<skills::SkillInventory, String> {
    let home_directory = app.path().home_dir().map_err(|error| error.to_string())?;
    let workspace_directory = workspace_directory.map(PathBuf::from);
    Ok(skills::scan_installed_skills(
        home_directory,
        workspace_directory,
    ))
}

#[tauri::command]
fn collect_diagnostics(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    severity: Option<diagnostics::Severity>,
    agent: Option<Agent>,
    scope: Option<Scope>,
) -> Result<Vec<diagnostics::UnifiedDiagnostic>, String> {
    let home_directory = app.path().home_dir().map_err(|error| error.to_string())?;
    let context = ScanContext::from_environment(&home_directory);
    let documents = [
        ClaudeCodeAdapter.scan_global(&context),
        agents::standard::CodexAdapter.scan_global(&context),
        agents::standard::OpenCodeAdapter.scan_global(&context),
    ];
    let mut collected = documents
        .iter()
        .flat_map(diagnostics::from_config)
        .collect::<Vec<_>>();
    let inventory = skills::scan_installed_skills(&home_directory, None::<&Path>);
    collected.extend(
        inventory
            .diagnostics
            .iter()
            .map(|item| diagnostics::from_skill(item, None, None)),
    );
    let storage = state
        .storage_diagnostics
        .diagnostics()
        .map_err(|error| error.to_string())?;
    collected.push(diagnostics::storage_health(
        storage.schema_version,
        &storage.forbidden_schema_columns,
    ));
    Ok(diagnostics::filter_diagnostics(
        &collected,
        &diagnostics::DiagnosticFilter {
            severity,
            agent,
            scope,
        },
    ))
}

#[tauri::command]
fn preview_config_edit(
    state: tauri::State<'_, AppState>,
    path: String,
    format: ConfigFormat,
    replacement: String,
) -> Result<configuration::ConfigEditPreview, String> {
    state.ensure_authorized(Path::new(&path))?;
    configuration::preview(path, format, replacement.as_bytes()).map_err(|error| {
        logging::command_failed(
            logging::Command::PreviewConfigEdit,
            logging::FailureCode::Configuration,
        );
        error.to_string()
    })
}

#[tauri::command]
fn read_config_source(state: tauri::State<'_, AppState>, path: String) -> Result<String, String> {
    state.ensure_authorized(Path::new(&path))?;
    std::fs::read_to_string(path).map_err(|_| {
        logging::command_failed(
            logging::Command::ReadConfigSource,
            logging::FailureCode::Configuration,
        );
        "could not read the authorized configuration source".into()
    })
}

#[tauri::command]
fn write_config(
    state: tauri::State<'_, AppState>,
    path: String,
    format: ConfigFormat,
    expected_checksum: String,
    replacement: String,
) -> Result<configuration::ConfigWriteResult, String> {
    state.ensure_authorized(Path::new(&path))?;
    configuration::write_atomically(
        path,
        format,
        &expected_checksum,
        replacement.as_bytes(),
        &state.backup_root,
    )
    .map_err(|error| {
        logging::command_failed(
            logging::Command::WriteConfig,
            logging::FailureCode::Configuration,
        );
        error.to_string()
    })
}

#[tauri::command]
fn rollback_config(
    state: tauri::State<'_, AppState>,
    path: String,
    format: ConfigFormat,
    expected_checksum: String,
    backup_path: String,
) -> Result<configuration::ConfigWriteResult, String> {
    state.ensure_authorized(Path::new(&path))?;
    configuration::rollback(
        path,
        format,
        &expected_checksum,
        backup_path,
        &state.backup_root,
    )
    .map_err(|error| {
        logging::command_failed(
            logging::Command::RollbackConfig,
            logging::FailureCode::Configuration,
        );
        error.to_string()
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(logging::plugin())
        .setup(|app| {
            let data_directory = app.path().app_data_dir().map_err(|error| {
                std::io::Error::other(format!("could not resolve app data directory: {error}"))
            })?;
            let database_path = data_directory.join("agent-hub.sqlite3");
            let database = persistence::Database::open(&database_path).map_err(|error| {
                logging::command_failed(
                    logging::Command::DatabaseOpen,
                    logging::FailureCode::Persistence,
                );
                std::io::Error::other(error.to_string())
            })?;
            logging::database_opened();
            logging::app_started(env!("CARGO_PKG_VERSION"));
            let database = Arc::new(database);
            let workspace_repository: Arc<dyn WorkspaceRepository> = database.clone();
            let storage_repository: Arc<dyn StorageDiagnosticsRepository> = database;
            app.manage(AppState::new(
                workspace_repository,
                storage_repository,
                data_directory.join("backups"),
            ));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            storage_diagnostics,
            scan_claude_global,
            scan_codex_global,
            scan_opencode_global,
            scan_skills,
            collect_diagnostics,
            list_workspaces,
            add_workspace,
            remove_workspace,
            scan_workspace,
            read_config_source,
            preview_config_edit,
            write_config,
            rollback_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running AgentHub");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_application_metadata() {
        assert_eq!(
            app_info(),
            AppInfo {
                name: "AgentHub",
                version: env!("CARGO_PKG_VERSION"),
            }
        );
    }

    #[test]
    fn workspace_input_is_canonical_and_instruction_scan_is_read_only() {
        let root = tempfile::tempdir().expect("workspace");
        std::fs::write(root.path().join("AGENTS.md"), "# Rules").expect("instruction");
        std::fs::create_dir(root.path().join("nested")).expect("nested directory");
        std::fs::write(root.path().join("nested/CLAUDE.local.md"), "# Local")
            .expect("nested instruction");
        let input = workspace_input(&root.path().to_string_lossy()).expect("workspace input");
        assert_eq!(
            input.canonical_path.as_deref(),
            Some(
                root.path()
                    .canonicalize()
                    .expect("canonical")
                    .to_string_lossy()
                    .as_ref()
            )
        );
        let instructions = discover_instruction_files(root.path());
        assert_eq!(instructions.len(), 2);
        assert!(root.path().join("AGENTS.md").is_file());
    }

    #[cfg(unix)]
    #[test]
    fn workspace_input_rejects_symbolic_links() {
        use std::os::unix::fs::symlink;
        let root = tempfile::tempdir().expect("workspace");
        let link = root.path().with_extension("link");
        symlink(root.path(), &link).expect("symlink");
        assert!(workspace_input(&link.to_string_lossy()).is_err());
        std::fs::remove_file(link).expect("remove link");
    }
}
