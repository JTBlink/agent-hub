use serde::Serialize;
use tauri::Manager;

pub mod agents;
pub mod domain;
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

#[tauri::command]
fn storage_diagnostics(
    database: tauri::State<'_, persistence::Database>,
) -> Result<persistence::DatabaseDiagnostics, String> {
    database.diagnostics().map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_directory = app.path().app_data_dir().map_err(|error| {
                std::io::Error::other(format!("could not resolve app data directory: {error}"))
            })?;
            let database_path = data_directory.join("agent-hub.sqlite3");
            let database = persistence::Database::open(&database_path)
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            app.manage(database);
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
