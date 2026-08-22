//! Unified, filterable diagnostics for configuration, Skill and storage domains.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::{agents::ConfigDocument, skills::SourceDiagnostic, Agent, Scope};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiagnosticKind {
    ConfigSyntax,
    Permission,
    ExternalModification,
    DuplicateSkill,
    SourceUnavailable,
    VersionMismatch,
    Storage,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FixSafety {
    Safe,
    RequiresConfirmation,
    Manual,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedDiagnostic {
    pub code: String,
    pub kind: DiagnosticKind,
    pub severity: Severity,
    pub agent: Option<Agent>,
    pub scope: Option<Scope>,
    pub resource_path: Option<PathBuf>,
    pub impact: String,
    pub next_action: String,
    pub fix_safety: FixSafety,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DiagnosticFilter {
    pub severity: Option<Severity>,
    pub agent: Option<Agent>,
    pub scope: Option<Scope>,
}

pub fn filter_diagnostics(
    diagnostics: &[UnifiedDiagnostic],
    filter: &DiagnosticFilter,
) -> Vec<UnifiedDiagnostic> {
    diagnostics
        .iter()
        .filter(|diagnostic| {
            filter
                .severity
                .is_none_or(|severity| diagnostic.severity == severity)
                && filter
                    .agent
                    .is_none_or(|agent| diagnostic.agent == Some(agent))
                && filter
                    .scope
                    .is_none_or(|scope| diagnostic.scope == Some(scope))
        })
        .cloned()
        .collect()
}

pub fn from_config(document: &ConfigDocument) -> Vec<UnifiedDiagnostic> {
    document
        .diagnostics
        .iter()
        .map(|diagnostic| {
            let (kind, impact, next_action, fix_safety) = match diagnostic.code {
                crate::agents::DiagnosticCode::FileMissing => (
                    DiagnosticKind::SourceUnavailable,
                    "该作用域当前没有配置文件",
                    "需要配置时创建文件，或确认 Agent 的配置根目录",
                    FixSafety::RequiresConfirmation,
                ),
                crate::agents::DiagnosticCode::PermissionDenied => (
                    DiagnosticKind::Permission,
                    "AgentHub 无法读取或管理该配置",
                    "检查文件所有者和当前用户权限后重新扫描",
                    FixSafety::Manual,
                ),
                crate::agents::DiagnosticCode::JsonSyntax
                | crate::agents::DiagnosticCode::JsoncSyntax
                | crate::agents::DiagnosticCode::TomlSyntax => (
                    DiagnosticKind::ConfigSyntax,
                    "Agent 可能忽略部分或全部配置",
                    "打开只读源码定位语法错误，修复后重新扫描",
                    FixSafety::RequiresConfirmation,
                ),
                crate::agents::DiagnosticCode::IoFailure => (
                    DiagnosticKind::SourceUnavailable,
                    "配置扫描未完成",
                    "检查磁盘状态和路径后重试",
                    FixSafety::Manual,
                ),
            };
            UnifiedDiagnostic {
                code: format!("config:{:?}", diagnostic.code).to_ascii_lowercase(),
                kind,
                severity: if matches!(diagnostic.code, crate::agents::DiagnosticCode::FileMissing) {
                    Severity::Info
                } else {
                    Severity::Error
                },
                agent: Some(document.agent),
                scope: Some(document.scope),
                resource_path: Some(document.path.clone()),
                impact: impact.into(),
                next_action: next_action.into(),
                fix_safety,
            }
        })
        .collect()
}

pub fn from_skill(
    source: &SourceDiagnostic,
    agent: Option<Agent>,
    scope: Option<Scope>,
) -> UnifiedDiagnostic {
    UnifiedDiagnostic {
        code: format!("skill:{}", source.code),
        kind: if source.code.contains("duplicate") {
            DiagnosticKind::DuplicateSkill
        } else {
            DiagnosticKind::SourceUnavailable
        },
        severity: match source.severity {
            crate::skills::DiagnosticSeverity::Info => Severity::Info,
            crate::skills::DiagnosticSeverity::Warning => Severity::Warning,
            crate::skills::DiagnosticSeverity::Error => Severity::Error,
        },
        agent,
        scope,
        resource_path: source.path.as_ref().map(PathBuf::from),
        impact: "Skill 可能无法安装或被目标 Agent 加载".into(),
        next_action: "检查入口、来源版本和同名 Skill 后重新扫描".into(),
        fix_safety: FixSafety::RequiresConfirmation,
    }
}

pub fn storage_health(schema_version: i64, forbidden_columns: &[String]) -> UnifiedDiagnostic {
    let healthy = forbidden_columns.is_empty();
    UnifiedDiagnostic {
        code: if healthy {
            "storage:healthy"
        } else {
            "storage:sensitive-schema"
        }
        .into(),
        kind: DiagnosticKind::Storage,
        severity: if healthy {
            Severity::Info
        } else {
            Severity::Error
        },
        agent: None,
        scope: None,
        resource_path: None,
        impact: if healthy {
            format!("SQLite schema v{schema_version} 已就绪")
        } else {
            "数据库 schema 包含禁止的敏感列".into()
        },
        next_action: if healthy {
            "无需操作".into()
        } else {
            "停止写入并检查 migration".into()
        },
        fix_safety: if healthy {
            FixSafety::Safe
        } else {
            FixSafety::Manual
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        agents::{ConfigStatus, Diagnostic, DiagnosticCode},
        ConfigFormat,
    };
    use serde_json::Value;

    #[test]
    fn config_diagnostics_include_impact_path_and_next_action() {
        let document = ConfigDocument {
            agent: Agent::Codex,
            scope: Scope::Workspace,
            format: ConfigFormat::Toml,
            path: "/workspace/.codex/config.toml".into(),
            status: ConfigStatus::Invalid,
            checksum: None,
            modified_at_ms: None,
            structured_view: Value::Null,
            source_preview: String::new(),
            diagnostics: vec![Diagnostic {
                code: DiagnosticCode::TomlSyntax,
                message: "syntax invalid".into(),
                line: None,
                column: None,
            }],
        };
        let diagnostics = from_config(&document);
        assert_eq!(diagnostics[0].kind, DiagnosticKind::ConfigSyntax);
        assert!(!diagnostics[0].impact.is_empty());
        assert!(!diagnostics[0].next_action.is_empty());
        assert_eq!(
            filter_diagnostics(
                &diagnostics,
                &DiagnosticFilter {
                    agent: Some(Agent::Codex),
                    ..Default::default()
                }
            )
            .len(),
            1
        );
    }

    #[test]
    fn storage_health_never_exposes_database_path() {
        let diagnostic = storage_health(2, &[]);
        assert_eq!(diagnostic.resource_path, None);
        assert_eq!(diagnostic.severity, Severity::Info);
    }
}
