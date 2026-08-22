use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;

use crate::{Agent, ConfigFormat, Scope};

pub mod claude;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScanContext {
    home_directory: PathBuf,
    claude_config_directory: Option<PathBuf>,
}

impl ScanContext {
    pub fn new(home_directory: impl AsRef<Path>) -> Self {
        Self {
            home_directory: home_directory.as_ref().to_path_buf(),
            claude_config_directory: None,
        }
    }

    pub fn with_claude_config_dir(mut self, directory: impl AsRef<Path>) -> Self {
        self.claude_config_directory = Some(directory.as_ref().to_path_buf());
        self
    }

    pub(crate) fn claude_config_directory(&self) -> PathBuf {
        self.claude_config_directory
            .clone()
            .or_else(|| std::env::var_os("CLAUDE_CONFIG_DIR").map(PathBuf::from))
            .unwrap_or_else(|| self.home_directory.join(".claude"))
    }
}

pub trait AgentConfigAdapter {
    fn scan_global(&self, context: &ScanContext) -> ConfigDocument;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ConfigStatus {
    Ready,
    Missing,
    Invalid,
    Unreadable,
}

impl ConfigStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Ready => "ready",
            Self::Missing => "missing",
            Self::Invalid => "invalid",
            Self::Unreadable => "unreadable",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DiagnosticCode {
    FileMissing,
    PermissionDenied,
    JsonSyntax,
    IoFailure,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub code: DiagnosticCode,
    pub message: String,
    pub line: Option<usize>,
    pub column: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigDocument {
    pub agent: Agent,
    pub scope: Scope,
    pub format: ConfigFormat,
    pub path: PathBuf,
    pub status: ConfigStatus,
    pub checksum: Option<String>,
    pub modified_at_ms: Option<u128>,
    pub structured_view: Value,
    pub source_preview: String,
    pub diagnostics: Vec<Diagnostic>,
}
