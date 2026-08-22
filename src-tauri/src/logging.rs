use log::{error, info};
use tauri_plugin_log::{Target, TargetKind};

use crate::{agents::ConfigStatus, Agent, Scope};

const TARGET: &str = "agent_hub";

/// Builds the single logging adapter used by the desktop runtime.
pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_log::Builder::default()
        .targets([
            Target::new(TargetKind::Stdout),
            Target::new(TargetKind::LogDir {
                file_name: Some("agent-hub".into()),
            }),
        ])
        .level(log::LevelFilter::Info)
        .build()
}

pub fn app_started(version: &str) {
    info!(target: TARGET, "event=app_started version={}", safe_label(version));
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Command {
    DatabaseOpen,
    StorageDiagnostics,
    ScanClaudeGlobal,
    ScanCodexGlobal,
    ScanOpenCodeGlobal,
    ScanSkills,
    PreviewConfigEdit,
    ReadConfigSource,
    WriteConfig,
    RollbackConfig,
}

impl Command {
    const fn as_str(self) -> &'static str {
        match self {
            Self::DatabaseOpen => "database_open",
            Self::StorageDiagnostics => "storage_diagnostics",
            Self::ScanClaudeGlobal => "scan_claude_global",
            Self::ScanCodexGlobal => "scan_codex_global",
            Self::ScanOpenCodeGlobal => "scan_opencode_global",
            Self::ScanSkills => "scan_skills",
            Self::PreviewConfigEdit => "preview_config_edit",
            Self::ReadConfigSource => "read_config_source",
            Self::WriteConfig => "write_config",
            Self::RollbackConfig => "rollback_config",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureCode {
    Persistence,
    Configuration,
    Skills,
}

impl FailureCode {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Persistence => "persistence_error",
            Self::Configuration => "configuration_error",
            Self::Skills => "skills_error",
        }
    }
}

pub fn database_opened() {
    info!(target: TARGET, "event=database_opened location=app_data");
}

pub fn command_failed(command: Command, code: FailureCode) {
    error!(
        target: TARGET,
        "event=command_failed command={} code={}",
        command.as_str(),
        code.as_str()
    );
}

pub fn config_scan_completed(agent: Agent, scope: Scope, status: ConfigStatus) {
    info!(
        target: TARGET,
        "event=config_scan_completed agent={} scope={} status={}",
        agent.as_str(),
        scope.as_str(),
        status.as_str()
    );
}

fn safe_label(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '_'
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn freeform_version_labels_cannot_inject_newlines_or_fields() {
        assert_eq!(safe_label("config\napiKey=secret"), "config_apiKey_secret");
        assert_eq!(Command::DatabaseOpen.as_str(), "database_open");
    }
}
