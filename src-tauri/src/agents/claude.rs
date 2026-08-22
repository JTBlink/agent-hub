use std::{fs, io::ErrorKind, sync::OnceLock, time::UNIX_EPOCH};

use regex::Regex;
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::{Agent, ConfigFormat, Scope};

use super::{
    AgentConfigAdapter, ConfigDocument, ConfigStatus, Diagnostic, DiagnosticCode, ScanContext,
};

const REDACTED_VALUE: &str = "••••••";

pub struct ClaudeCodeAdapter;

impl AgentConfigAdapter for ClaudeCodeAdapter {
    fn scan_global(&self, context: &ScanContext) -> ConfigDocument {
        let path = context.claude_config_directory().join("settings.json");
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
                return empty_document(
                    path,
                    status,
                    Diagnostic {
                        code,
                        message: error.to_string(),
                        line: None,
                        column: None,
                    },
                );
            }
        };

        let checksum = Some(format!("{:x}", Sha256::digest(&bytes)));
        let modified_at_ms = fs::metadata(&path)
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis());

        match serde_json::from_slice::<Value>(&bytes) {
            Ok(mut structured_view) => {
                redact_sensitive_values(&mut structured_view);
                let source_preview = redact_raw_preview(&String::from_utf8_lossy(&bytes));
                ConfigDocument {
                    agent: Agent::ClaudeCode,
                    scope: Scope::Global,
                    format: ConfigFormat::Json,
                    path,
                    status: ConfigStatus::Ready,
                    checksum,
                    modified_at_ms,
                    structured_view,
                    source_preview,
                    diagnostics: Vec::new(),
                }
            }
            Err(error) => ConfigDocument {
                agent: Agent::ClaudeCode,
                scope: Scope::Global,
                format: ConfigFormat::Json,
                path,
                status: ConfigStatus::Invalid,
                checksum,
                modified_at_ms,
                structured_view: Value::Null,
                source_preview: redact_raw_preview(&String::from_utf8_lossy(&bytes)),
                diagnostics: vec![Diagnostic {
                    code: DiagnosticCode::JsonSyntax,
                    message: error.to_string(),
                    line: Some(error.line()),
                    column: Some(error.column()),
                }],
            },
        }
    }
}

fn empty_document(
    path: std::path::PathBuf,
    status: ConfigStatus,
    diagnostic: Diagnostic,
) -> ConfigDocument {
    ConfigDocument {
        agent: Agent::ClaudeCode,
        scope: Scope::Global,
        format: ConfigFormat::Json,
        path,
        status,
        checksum: None,
        modified_at_ms: None,
        structured_view: Value::Null,
        source_preview: String::new(),
        diagnostics: vec![diagnostic],
    }
}

fn redact_sensitive_values(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for (key, value) in map {
                if is_sensitive_key(key) {
                    *value = Value::String(REDACTED_VALUE.to_owned());
                } else {
                    redact_sensitive_values(value);
                }
            }
        }
        Value::Array(values) => {
            for value in values {
                redact_sensitive_values(value);
            }
        }
        _ => {}
    }
}

fn is_sensitive_key(key: &str) -> bool {
    let normalized = key
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect::<String>();
    [
        "apikey",
        "token",
        "secret",
        "password",
        "credential",
        "authorization",
        "cookie",
        "privatekey",
    ]
    .iter()
    .any(|marker| normalized.contains(marker))
}

fn redact_raw_preview(input: &str) -> String {
    static SENSITIVE_JSON_VALUE: OnceLock<Regex> = OnceLock::new();
    let pattern = SENSITIVE_JSON_VALUE.get_or_init(|| {
        Regex::new(
            r#"(?i)([\"']?(?:api[_-]?key|token|secret|password|credential|authorization|cookie|private[_-]?key)[\"']?\s*:\s*)(?:\"(?:\\.|[^\"\\])*\"|[^,\s}\]]+)"#,
        )
        .expect("sensitive JSON preview pattern is valid")
    });
    pattern.replace_all(input, "$1\"••••••\"").into_owned()
}
