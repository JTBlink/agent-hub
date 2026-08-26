//! Configuration adapters for Codex and OpenCode.
//!
//! The adapters share discovery and diagnostics behavior while keeping each
//! product's path and format rules in one place. They never create missing
//! directories or execute project files.

use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::{Agent, ConfigFormat, Scope};

use super::{
    AgentConfigAdapter, ConfigDocument, ConfigStatus, Diagnostic, DiagnosticCode, ScanContext,
};

pub struct CodexAdapter;
pub struct OpenCodeAdapter;

impl AgentConfigAdapter for CodexAdapter {
    fn scan_global(&self, context: &ScanContext) -> ConfigDocument {
        scan_file(
            Agent::Codex,
            Scope::Global,
            ConfigFormat::Toml,
            context.codex_home_directory().join("config.toml"),
            parse_toml,
        )
    }
}

impl AgentConfigAdapter for OpenCodeAdapter {
    fn scan_global(&self, context: &ScanContext) -> ConfigDocument {
        scan_file(
            Agent::OpenCode,
            Scope::Global,
            ConfigFormat::Jsonc,
            context.opencode_config_file(),
            parse_jsonc,
        )
    }
}

impl CodexAdapter {
    pub fn scan_workspace(&self, workspace: impl AsRef<Path>) -> ConfigDocument {
        scan_file(
            Agent::Codex,
            Scope::Workspace,
            ConfigFormat::Toml,
            workspace.as_ref().join(".codex/config.toml"),
            parse_toml,
        )
    }
}

impl OpenCodeAdapter {
    pub fn scan_workspace(&self, workspace: impl AsRef<Path>) -> ConfigDocument {
        let path = workspace.as_ref().join("opencode.json");
        scan_file(
            Agent::OpenCode,
            Scope::Workspace,
            ConfigFormat::Jsonc,
            path,
            parse_jsonc,
        )
    }
}

type Parser = fn(&str) -> Result<Value, String>;

fn scan_file(
    agent: Agent,
    scope: Scope,
    format: ConfigFormat,
    path: PathBuf,
    parser: Parser,
) -> ConfigDocument {
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) => {
            let (status, code) = match error.kind() {
                ErrorKind::NotFound => (ConfigStatus::Missing, DiagnosticCode::FileMissing),
                ErrorKind::PermissionDenied => {
                    (ConfigStatus::Unreadable, DiagnosticCode::PermissionDenied)
                }
                _ => (ConfigStatus::Unreadable, DiagnosticCode::IoFailure),
            };
            return ConfigDocument {
                agent,
                scope,
                format,
                path,
                status,
                checksum: None,
                modified_at_ms: None,
                structured_view: Value::Null,
                source_preview: String::new(),
                diagnostics: vec![Diagnostic {
                    code,
                    message: error.to_string(),
                    line: None,
                    column: None,
                }],
            };
        }
    };
    let checksum = Some(format!("{:x}", Sha256::digest(&bytes)));
    let modified_at_ms = fs::metadata(&path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis());
    let source = String::from_utf8_lossy(&bytes).into_owned();
    let source_preview = crate::configuration::redact_source_for_display(&bytes);
    match parser(&source) {
        Ok(mut structured_view) => {
            if !structured_view.is_object() {
                return ConfigDocument {
                    agent,
                    scope,
                    format,
                    path,
                    status: ConfigStatus::Invalid,
                    checksum,
                    modified_at_ms,
                    structured_view: Value::Null,
                    source_preview,
                    diagnostics: vec![Diagnostic {
                        code: DiagnosticCode::SchemaMismatch,
                        message: "configuration root must be an object/table".into(),
                        line: None,
                        column: None,
                    }],
                };
            }
            if agent == Agent::OpenCode
                && structured_view
                    .get("$schema")
                    .is_some_and(|schema| !schema.is_string())
            {
                return ConfigDocument {
                    agent,
                    scope,
                    format,
                    path,
                    status: ConfigStatus::Invalid,
                    checksum,
                    modified_at_ms,
                    structured_view: Value::Null,
                    source_preview,
                    diagnostics: vec![Diagnostic {
                        code: DiagnosticCode::SchemaMismatch,
                        message: "OpenCode $schema must be a string when present".into(),
                        line: None,
                        column: None,
                    }],
                };
            }
            crate::configuration::redact_sensitive_values(&mut structured_view);
            ConfigDocument {
                agent,
                scope,
                format,
                path,
                status: ConfigStatus::Ready,
                checksum,
                modified_at_ms,
                structured_view,
                source_preview,
                diagnostics: Vec::new(),
            }
        }
        Err(_) => ConfigDocument {
            agent,
            scope,
            format,
            path,
            status: ConfigStatus::Invalid,
            checksum,
            modified_at_ms,
            structured_view: Value::Null,
            source_preview,
            diagnostics: vec![Diagnostic {
                code: match format {
                    ConfigFormat::Toml => DiagnosticCode::TomlSyntax,
                    ConfigFormat::Jsonc => DiagnosticCode::JsoncSyntax,
                    _ => DiagnosticCode::JsonSyntax,
                },
                message: format!("{} syntax is invalid", format.as_str()),
                line: None,
                column: None,
            }],
        },
    }
}

fn parse_toml(source: &str) -> Result<Value, String> {
    let value = source
        .parse::<toml::Value>()
        .map_err(|error| error.to_string())?;
    serde_json::to_value(value).map_err(|error| error.to_string())
}

fn parse_jsonc(source: &str) -> Result<Value, String> {
    crate::configuration::parse_jsonc_value(source)
}
