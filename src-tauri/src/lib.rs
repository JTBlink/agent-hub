mod config_commands;
use config_commands::*;
mod diagnostic_commands;
mod workspace_commands;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::Command as ProcessCommand,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use workspace_commands::*;

use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

use agents::{claude::ClaudeCodeAdapter, AgentConfigAdapter, ConfigDocument, ScanContext};
use persistence::{ConfigMetadataRepository, StorageDiagnosticsRepository, WorkspaceRepository};

pub mod agents;
pub mod app_paths;
pub mod configuration;
pub mod diagnostics;
pub mod domain;
pub mod embedded_browser;
pub mod logging;
pub mod persistence;
pub mod skills_module;

pub use domain::{Agent, ConfigFormat, InstallationState, ParseStatus, Scope, SkillKind};

/// Run the package-level smoke checks without starting the GUI.
///
/// Release workflows invoke this through the installed binary on each native
/// runner. It exercises the same read-only scan, guarded atomic write and
/// migration code shipped in the package, while keeping all fixtures in a
/// disposable temporary directory.
pub fn run_package_smoke() -> Result<(), String> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "agent-hub-package-smoke-{}-{nonce}",
        std::process::id()
    ));
    if root.exists() {
        fs::remove_dir_all(&root).map_err(|error| error.to_string())?;
    }
    let result = run_package_smoke_in(&root);
    let cleanup = fs::remove_dir_all(&root);
    match (result, cleanup) {
        (Err(error), Ok(())) | (Err(error), Err(_)) => Err(error),
        (Ok(()), Ok(())) => Ok(()),
        (Ok(()), Err(error)) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        (Ok(()), Err(error)) => Err(format!("smoke fixture cleanup failed: {error}")),
    }
}

fn run_package_smoke_in(root: &Path) -> Result<(), String> {
    let config_directory = root.join(".claude");
    fs::create_dir_all(&config_directory).map_err(|error| error.to_string())?;
    let config_path = config_directory.join("settings.json");
    let initial = br#"{"model":"sonnet","apiKey":"smoke-secret"}
"#;
    fs::write(&config_path, initial).map_err(|error| error.to_string())?;

    let document = ClaudeCodeAdapter.scan_global(&ScanContext::new(root));
    if document.status != agents::ConfigStatus::Ready {
        return Err(format!("package smoke scan returned {:?}", document.status));
    }
    let expected_checksum = document
        .checksum
        .as_deref()
        .ok_or_else(|| "package smoke scan did not return a checksum".to_owned())?;
    let replacement = br#"{"model":"opus","apiKey":"smoke-secret"}
"#;
    let preview = configuration::preview(&config_path, ConfigFormat::Json, replacement)
        .map_err(|error| error.to_string())?;
    if !preview.changed {
        return Err("package smoke preview did not detect the edit".to_owned());
    }
    let backup_root = root.join(".agenthub").join("backups");
    let write = configuration::write_atomically(
        &config_path,
        ConfigFormat::Json,
        expected_checksum,
        replacement,
        &backup_root,
    )
    .map_err(|error| error.to_string())?;
    if fs::read(&config_path).map_err(|error| error.to_string())? != replacement {
        return Err("package smoke write did not persist the replacement".to_owned());
    }
    if !write.backup_path.is_file() {
        return Err("package smoke write did not create a backup".to_owned());
    }

    let database_path = root.join(".agenthub").join("agent-hub.sqlite3");
    let database =
        persistence::Database::open(&database_path).map_err(|error| error.to_string())?;
    let diagnostics = database.diagnostics().map_err(|error| error.to_string())?;
    if diagnostics.schema_version < 1 || !diagnostics.foreign_keys_enabled {
        return Err("package smoke migration diagnostics are incomplete".to_owned());
    }
    drop(database);
    let reopened =
        persistence::Database::open(&database_path).map_err(|error| error.to_string())?;
    let reopened_diagnostics = reopened.diagnostics().map_err(|error| error.to_string())?;
    if reopened_diagnostics.schema_version != diagnostics.schema_version {
        return Err("package smoke migration was not idempotent".to_owned());
    }
    Ok(())
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    name: &'static str,
    version: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UserDataLocation {
    path: String,
    bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UserDataPaths {
    root: UserDataLocation,
    database: UserDataLocation,
    backups: UserDataLocation,
    skill_sources: UserDataLocation,
    logs: UserDataLocation,
}

#[tauri::command]
fn user_data_paths(state: State<'_, AppState>) -> UserDataPaths {
    let root = state
        .backup_root
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| state.backup_root.clone());
    user_data_paths_for_root(&root)
}

#[tauri::command]
fn clear_user_data(kind: String, state: State<'_, AppState>) -> Result<UserDataPaths, String> {
    let root = state
        .backup_root
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| state.backup_root.clone());
    let target = match kind.as_str() {
        "logs" => root.join("logs"),
        "backups" => root.join("backups"),
        _ => return Err("only backups and logs can be cleared".to_owned()),
    };
    if target.exists() {
        fs::remove_dir_all(&target).map_err(|error| error.to_string())?;
    }
    fs::create_dir_all(&target).map_err(|error| error.to_string())?;
    Ok(user_data_paths_for_root(&root))
}

fn user_data_paths_for_root(root: &Path) -> UserDataPaths {
    let location = |path: PathBuf| UserDataLocation {
        bytes: path_size(&path),
        path: path.display().to_string(),
    };
    UserDataPaths {
        database: location(root.join("agent-hub.sqlite3")),
        backups: location(root.join("backups")),
        skill_sources: location(root.join("skill-sources")),
        logs: location(root.join("logs")),
        root: location(root.to_path_buf()),
    }
}

fn path_size(path: &Path) -> u64 {
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return 0;
    };
    if metadata.is_file() {
        return metadata.len();
    }
    if !metadata.is_dir() {
        return 0;
    }
    fs::read_dir(path)
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| path_size(&entry.path()))
        .sum()
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "AgentHub",
        version: env!("CARGO_PKG_VERSION"),
    }
}

#[tauri::command]
fn scan_agent_runtimes() -> Vec<agents::AgentRuntimeStatus> {
    agents::runtime_statuses()
}

struct AppState {
    workspaces: Arc<dyn WorkspaceRepository>,
    config_metadata: Arc<dyn ConfigMetadataRepository>,
    storage_diagnostics: Arc<dyn StorageDiagnosticsRepository>,
    authorized_config_paths: Mutex<HashMap<PathBuf, AuthorizedConfig>>,
    #[allow(dead_code)]
    recovery_registry: Mutex<diagnostics::RecoveryRegistry>,
    backup_root: PathBuf,
}

#[derive(Debug, Clone, Copy)]
struct AuthorizedConfig {
    id: i64,
    format: ConfigFormat,
}

impl AppState {
    fn new(
        workspaces: Arc<dyn WorkspaceRepository>,
        config_metadata: Arc<dyn ConfigMetadataRepository>,
        storage_diagnostics: Arc<dyn StorageDiagnosticsRepository>,
        backup_root: PathBuf,
    ) -> Self {
        Self {
            workspaces,
            config_metadata,
            storage_diagnostics,
            authorized_config_paths: Mutex::new(HashMap::new()),
            recovery_registry: Mutex::new(diagnostics::RecoveryRegistry::default()),
            backup_root,
        }
    }

    fn authorize(&self, document: &ConfigDocument, id: i64) -> Result<(), String> {
        self.authorized_config_paths
            .lock()
            .map_err(|_| "configuration authorization lock is unavailable".to_owned())?
            .insert(
                document.path.clone(),
                AuthorizedConfig {
                    id,
                    format: document.format,
                },
            );
        Ok(())
    }

    fn authorization(&self, path: &Path) -> Result<AuthorizedConfig, String> {
        let authorized = self
            .authorized_config_paths
            .lock()
            .map_err(|_| "configuration authorization lock is unavailable".to_owned())?;
        authorized
            .get(path)
            .copied()
            .ok_or_else(|| "configuration path must be discovered before it can be edited".into())
    }

    fn revoke_config_ids(&self, ids: &[i64]) -> Result<(), String> {
        self.authorized_config_paths
            .lock()
            .map_err(|_| "configuration authorization lock is unavailable".to_owned())?
            .retain(|_, authorization| !ids.contains(&authorization.id));
        Ok(())
    }
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
    register_global_config(&state, &document)?;
    Ok(document)
}

#[tauri::command]
fn scan_codex_global(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<ConfigDocument, String> {
    let home_directory = app.path().home_dir().map_err(|error| error.to_string())?;
    let document =
        agents::standard::CodexAdapter.scan_global(&ScanContext::from_environment(home_directory));
    register_global_config(&state, &document)?;
    Ok(document)
}

#[tauri::command]
fn scan_opencode_global(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<ConfigDocument, String> {
    let home_directory = app.path().home_dir().map_err(|error| error.to_string())?;
    let document = agents::standard::OpenCodeAdapter
        .scan_global(&ScanContext::from_environment(home_directory));
    register_global_config(&state, &document)?;
    Ok(document)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let home_directory = dirs::home_dir().expect("could not resolve the user home directory");
    let app_paths = app_paths::AppPaths::from_home(&home_directory);
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(logging::plugin(app_paths.logs.clone()))
        .setup(move |app| {
            let legacy_data_directory = app.path().app_data_dir().map_err(|error| {
                std::io::Error::other(format!(
                    "could not resolve legacy app data directory: {error}"
                ))
            })?;
            app_paths.prepare(&legacy_data_directory)?;
            let database = persistence::Database::open(&app_paths.database).map_err(|error| {
                logging::command_failed(
                    logging::Command::DatabaseOpen,
                    logging::FailureCode::Persistence,
                );
                std::io::Error::other(error.to_string())
            })?;
            database
                .relocate_backup_paths(legacy_data_directory.join("backups"), &app_paths.backups)
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            logging::database_opened();
            logging::app_started(env!("CARGO_PKG_VERSION"));
            let database = Arc::new(database);
            let workspace_repository: Arc<dyn WorkspaceRepository> = database.clone();
            let config_metadata_repository: Arc<dyn ConfigMetadataRepository> = database.clone();
            let storage_repository: Arc<dyn StorageDiagnosticsRepository> = database.clone();
            let state = AppState::new(
                workspace_repository,
                config_metadata_repository,
                storage_repository,
                app_paths.backups.clone(),
            );
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            skills_module::open_skills_manager,
            user_data_paths,
            clear_user_data,
            storage_diagnostics,
            scan_agent_runtimes,
            scan_claude_global,
            scan_codex_global,
            scan_opencode_global,
            diagnostic_commands::collect_diagnostics,
            diagnostic_commands::preview_diagnostic_recovery,
            diagnostic_commands::execute_diagnostic_recovery,
            workspace_commands::list_workspaces,
            workspace_commands::add_workspace,
            workspace_commands::remove_workspace,
            workspace_commands::scan_workspace,
            workspace_commands::create_claude_instruction_symlink,
            config_commands::read_config_source,
            config_commands::open_directory_in_editor,
            config_commands::preview_config_edit,
            config_commands::write_config,
            config_commands::rollback_config,
            config_commands::list_config_history,
            config_commands::get_config_history_entry,
            config_commands::preview_config_restore,
            config_commands::restore_config_history,
            embedded_browser::navigate_embedded_browser,
            embedded_browser::control_embedded_browser,
            embedded_browser::embedded_browser_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AgentHub");
}

#[cfg(test)]
mod command_tests;
