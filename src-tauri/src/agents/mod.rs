use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;

use crate::{Agent, ConfigFormat, Scope};

pub mod claude;
pub mod standard;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScanContext {
    home_directory: PathBuf,
    claude_config_directory: Option<PathBuf>,
    codex_home_directory: Option<PathBuf>,
    opencode_config_file: Option<PathBuf>,
}

impl ScanContext {
    pub fn new(home_directory: impl AsRef<Path>) -> Self {
        Self {
            home_directory: home_directory.as_ref().to_path_buf(),
            claude_config_directory: None,
            codex_home_directory: None,
            opencode_config_file: None,
        }
    }

    /// Builds a scan context from the runtime home and Claude's documented
    /// configuration-root override. The environment is captured once so a
    /// scan observes a stable path even if another component changes its
    /// environment afterwards.
    pub fn from_environment(home_directory: impl AsRef<Path>) -> Self {
        let mut context = Self::new(home_directory);
        context.claude_config_directory = std::env::var_os("CLAUDE_CONFIG_DIR")
            .filter(|directory| !directory.is_empty())
            .map(PathBuf::from);
        context.codex_home_directory = std::env::var_os("CODEX_HOME")
            .filter(|directory| !directory.is_empty())
            .map(PathBuf::from);
        context.opencode_config_file = std::env::var_os("OPENCODE_CONFIG")
            .filter(|path| !path.is_empty())
            .map(PathBuf::from);
        context
    }

    pub fn with_claude_config_dir(mut self, directory: impl AsRef<Path>) -> Self {
        self.claude_config_directory = Some(directory.as_ref().to_path_buf());
        self
    }

    pub fn with_codex_home(mut self, directory: impl AsRef<Path>) -> Self {
        self.codex_home_directory = Some(directory.as_ref().to_path_buf());
        self
    }

    pub fn with_opencode_config_file(mut self, path: impl AsRef<Path>) -> Self {
        self.opencode_config_file = Some(path.as_ref().to_path_buf());
        self
    }

    pub(crate) fn claude_config_directory(&self) -> PathBuf {
        self.claude_config_directory
            .clone()
            .unwrap_or_else(|| self.home_directory.join(".claude"))
    }

    pub(crate) fn codex_home_directory(&self) -> PathBuf {
        self.codex_home_directory
            .clone()
            .unwrap_or_else(|| self.home_directory.join(".codex"))
    }

    pub(crate) fn opencode_config_file(&self) -> PathBuf {
        self.opencode_config_file.clone().unwrap_or_else(|| {
            self.home_directory
                .join(".config")
                .join("opencode")
                .join("opencode.json")
        })
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
    JsoncSyntax,
    TomlSyntax,
    SchemaMismatch,
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
