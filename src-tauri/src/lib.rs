use std::sync::Arc;

use serde::Serialize;
use tauri::Manager;

use persistence::StorageDiagnosticsRepository;

pub mod agents;
pub mod domain;
pub mod logging;
pub mod persistence;

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
    storage_diagnostics: Arc<dyn StorageDiagnosticsRepository>,
}

impl AppState {
    fn new(storage_diagnostics: Arc<dyn StorageDiagnosticsRepository>) -> Self {
        Self {
            storage_diagnostics,
        }
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
            app.manage(AppState::new(Arc::new(database)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_info, storage_diagnostics])
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
}
