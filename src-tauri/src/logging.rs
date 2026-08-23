use std::path::PathBuf;

use log::{error, info};
use tauri_plugin_log::{Target, TargetKind};

use crate::{agents::ConfigStatus, Agent, Scope};

const TARGET: &str = "agent_hub";

/// Builds the single logging adapter used by the desktop runtime.
pub fn plugin(log_directory: PathBuf) -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_log::Builder::default()
        .targets([
            Target::new(TargetKind::Stdout),
            Target::new(TargetKind::Folder {
                path: log_directory,
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
    BrowseSkillSource,
    PlanSkillInstall,
    ApplySkillInstall,
    SetSkillEnabled,
    UninstallSkill,
    PreviewDiagnosticRecovery,
    ExecuteDiagnosticRecovery,
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
            Self::BrowseSkillSource => "browse_skill_source",
            Self::PlanSkillInstall => "plan_skill_install",
            Self::ApplySkillInstall => "apply_skill_install",
            Self::SetSkillEnabled => "set_skill_enabled",
            Self::UninstallSkill => "uninstall_skill",
            Self::PreviewDiagnosticRecovery => "preview_diagnostic_recovery",
            Self::ExecuteDiagnosticRecovery => "execute_diagnostic_recovery",
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
    Diagnostics,
}

impl FailureCode {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Persistence => "persistence_error",
            Self::Configuration => "configuration_error",
            Self::Skills => "skills_error",
            Self::Diagnostics => "diagnostics_error",
        }
    }
}

pub fn database_opened() {
    info!(target: TARGET, "event=database_opened location=user_data");
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

pub fn legacy_codex_action_started(action: &str) {
    info!(
        target: TARGET,
        "event=legacy_codex_action_started action={}",
        safe_label(action)
    );
}

pub fn legacy_codex_phase(action: &str, phase: &str) {
    info!(
        target: TARGET,
        "event=legacy_codex_action_phase action={} phase={}",
        safe_label(action),
        safe_label(phase)
    );
}

pub fn legacy_codex_action_completed(action: &str) {
    info!(
        target: TARGET,
        "event=legacy_codex_action_completed action={}",
        safe_label(action)
    );
}

pub fn legacy_codex_action_failed(action: &str, code: &str) {
    error!(
        target: TARGET,
        "event=legacy_codex_action_failed action={} code={}",
        safe_label(action),
        safe_label(code)
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
