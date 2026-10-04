//! Unified, filterable diagnostics for configuration, Skill and storage domains.

use std::{
    collections::{HashMap, VecDeque},
    fmt,
    path::PathBuf,
};

use serde::{Deserialize, Serialize};

use crate::{agents::ConfigDocument, configuration::ConfigurationError, Agent, Scope};

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
    Cache,
    Scan,
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
    pub resource_path: Option<PathBuf>,
}

/// A recovery operation exposed by a diagnostic. Mutating operations are
/// deliberately distinct from navigation-only next steps so callers cannot
/// accidentally treat opening an editor as a completed repair.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryAction {
    RescanResource,
    ReloadResource,
    CreateConfig,
    EditConfig,
    RestoreBackup,
    ResolveDuplicateSkill,
    RefreshSkillSource,
    ReviewVersionCompatibility,
    ReviewPermissions,
    RepairStorage,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryPlan {
    pub diagnostic_code: String,
    pub action: RecoveryAction,
    pub resource_path: Option<PathBuf>,
    pub safety: FixSafety,
    pub preview_required: bool,
    pub confirmation_required: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryPreview {
    pub recovery_id: String,
    pub plan: RecoveryPlan,
    pub summary: String,
    pub next_command: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryOutcome {
    Refreshed,
    Applied,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryResult {
    pub recovery_id: String,
    pub action: RecoveryAction,
    pub outcome: RecoveryOutcome,
    pub resource_path: Option<PathBuf>,
    pub next_command: Option<String>,
    pub diagnostics: Vec<UnifiedDiagnostic>,
}

const MAX_PENDING_RECOVERIES: usize = 128;

/// Bounded, in-memory one-time tickets. The caller cannot lower a diagnostic's
/// safety level between preview and execution because the authoritative plan is
/// retained here rather than round-tripped through the webview.
#[derive(Debug, Default)]
pub struct RecoveryRegistry {
    next_id: u64,
    pending: HashMap<String, PendingRecovery>,
    insertion_order: VecDeque<String>,
}

#[derive(Debug)]
struct PendingRecovery {
    plan: RecoveryPlan,
    content_checksum: Option<String>,
}

impl RecoveryRegistry {
    pub fn preview(&mut self, diagnostic: &UnifiedDiagnostic) -> Option<RecoveryPreview> {
        let plan = recovery_plan(diagnostic)?;
        self.next_id = self.next_id.wrapping_add(1);
        let recovery_id = format!("recovery-{}", self.next_id);
        if self.pending.len() == MAX_PENDING_RECOVERIES {
            if let Some(expired) = self.insertion_order.pop_front() {
                self.pending.remove(&expired);
            }
        }
        self.pending.insert(
            recovery_id.clone(),
            PendingRecovery {
                plan: plan.clone(),
                content_checksum: None,
            },
        );
        self.insertion_order.push_back(recovery_id.clone());
        Some(RecoveryPreview {
            recovery_id,
            summary: recovery_summary(&plan).into(),
            next_command: recovery_next_command(plan.action).map(str::to_owned),
            plan,
        })
    }

    pub fn plan(&self, recovery_id: &str) -> Option<RecoveryPlan> {
        self.pending
            .get(recovery_id)
            .map(|pending| pending.plan.clone())
    }

    pub fn bind_content_checksum(&mut self, recovery_id: &str, checksum: String) -> bool {
        let Some(pending) = self.pending.get_mut(recovery_id) else {
            return false;
        };
        pending.content_checksum = Some(checksum);
        true
    }

    pub fn content_checksum(&self, recovery_id: &str) -> Option<String> {
        self.pending
            .get(recovery_id)
            .and_then(|pending| pending.content_checksum.clone())
    }

    pub fn complete(&mut self, recovery_id: &str) -> bool {
        let removed = self.pending.remove(recovery_id).is_some();
        if removed {
            self.insertion_order.retain(|id| id != recovery_id);
        }
        removed
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RecoveryApproval {
    pub previewed: bool,
    pub confirmed: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecoveryError {
    PreviewRequired,
    ConfirmationRequired,
    ManualActionRequired,
}

impl fmt::Display for RecoveryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::PreviewRequired => "recovery must be previewed before execution",
            Self::ConfirmationRequired => "recovery requires explicit confirmation",
            Self::ManualActionRequired => "recovery can only be completed manually",
        })
    }
}

impl std::error::Error for RecoveryError {}

/// Execution is injected by the application layer. This keeps policy (what may
/// run automatically) testable without granting the diagnostics module direct
/// file-system or network access.
pub trait RecoveryExecutor {
    type Error;

    fn execute(&mut self, plan: &RecoveryPlan) -> Result<(), Self::Error>;
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
                && filter
                    .resource_path
                    .as_ref()
                    .is_none_or(|path| diagnostic.resource_path.as_ref() == Some(path))
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
                crate::agents::DiagnosticCode::SchemaMismatch => (
                    DiagnosticKind::VersionMismatch,
                    "配置字段与当前 Agent 版本或 schema 不匹配",
                    "核对 Agent 版本和官方 schema；未知字段先保留，确认兼容后再编辑",
                    FixSafety::Manual,
                ),
                crate::agents::DiagnosticCode::IoFailure => (
                    DiagnosticKind::SourceUnavailable,
                    "配置扫描未完成",
                    "检查磁盘状态和路径后重试",
                    FixSafety::Manual,
                ),
            };
            UnifiedDiagnostic {
                code: format!("config:{}", config_code(diagnostic.code)),
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

/// Convert a failed safe-write operation without exposing expected or actual
/// checksums in the user-facing diagnostic.
pub fn from_configuration_error(
    error: &ConfigurationError,
    agent: Agent,
    scope: Scope,
    resource_path: impl Into<PathBuf>,
) -> UnifiedDiagnostic {
    let (code, kind, impact, next_action, fix_safety) = match error {
        ConfigurationError::ExternalModified { .. } => (
            "config:external-modification",
            DiagnosticKind::ExternalModification,
            "文件在预览后被其他程序修改，本次写入已安全取消",
            "重新加载文件、检查新的遮罩 Diff，再明确确认写入",
            FixSafety::RequiresConfirmation,
        ),
        ConfigurationError::InvalidUtf8 | ConfigurationError::InvalidJson { .. } => (
            "config:write-validation-failed",
            DiagnosticKind::ConfigSyntax,
            "拟写入内容没有通过格式或文件校验，磁盘内容未改变",
            "返回编辑器修复内容并重新生成遮罩 Diff",
            FixSafety::RequiresConfirmation,
        ),
        ConfigurationError::Io(error) if error.kind() == std::io::ErrorKind::PermissionDenied => (
            "config:write-permission-denied",
            DiagnosticKind::Permission,
            "AgentHub 没有完成配置写入所需的文件权限，磁盘内容未改变",
            "检查文件所有者和当前用户权限后重新扫描",
            FixSafety::Manual,
        ),
        ConfigurationError::Io(error) if error.kind() == std::io::ErrorKind::InvalidData => (
            "config:write-validation-failed",
            DiagnosticKind::ConfigSyntax,
            "拟写入内容没有通过格式或文件校验，磁盘内容未改变",
            "返回编辑器修复内容并重新生成遮罩 Diff",
            FixSafety::RequiresConfirmation,
        ),
        ConfigurationError::Io(_) => (
            "config:write-io-failed",
            DiagnosticKind::SourceUnavailable,
            "配置写入因文件系统错误而取消",
            "检查磁盘和目标路径状态后重新扫描",
            FixSafety::Manual,
        ),
        ConfigurationError::UnsafeBackupPath | ConfigurationError::UnsafeTarget => (
            "config:unsafe-write-target",
            DiagnosticKind::Permission,
            "目标或备份路径不满足安全写入约束，操作已取消",
            "检查符号链接、硬链接和备份目录后重新扫描",
            FixSafety::Manual,
        ),
        ConfigurationError::VerificationFailed => (
            "config:write-verification-failed",
            DiagnosticKind::ExternalModification,
            "写入后的校验失败，AgentHub 已尝试从备份恢复",
            "重新扫描并核对当前文件；必要时从已验证备份恢复",
            FixSafety::RequiresConfirmation,
        ),
    };
    UnifiedDiagnostic {
        code: code.into(),
        kind,
        severity: Severity::Error,
        agent: Some(agent),
        scope: Some(scope),
        resource_path: Some(resource_path.into()),
        impact: impact.into(),
        next_action: next_action.into(),
        fix_safety,
    }
}

pub fn version_mismatch(
    agent: Agent,
    scope: Scope,
    resource_path: Option<PathBuf>,
    component: &str,
) -> UnifiedDiagnostic {
    UnifiedDiagnostic {
        code: format!("version:mismatch:{component}"),
        kind: DiagnosticKind::VersionMismatch,
        severity: Severity::Warning,
        agent: Some(agent),
        scope: Some(scope),
        resource_path,
        impact: format!("`{component}` 的版本或兼容性声明与目标 Agent 不匹配"),
        next_action: "核对来源版本与目标 Agent 支持范围，确认兼容后再安装或写入".into(),
        fix_safety: FixSafety::Manual,
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

/// Report the state of the optional derived cache. V1 does not need a cache;
/// reporting that explicitly avoids presenting an absent cache as a failure.
pub fn cache_health(entry_count: usize, stale_entries: usize) -> UnifiedDiagnostic {
    let healthy = stale_entries == 0;
    UnifiedDiagnostic {
        code: if healthy {
            "cache:healthy"
        } else {
            "cache:stale"
        }
        .into(),
        kind: DiagnosticKind::Cache,
        severity: if healthy {
            Severity::Info
        } else {
            Severity::Warning
        },
        agent: None,
        scope: None,
        resource_path: None,
        impact: if healthy {
            format!("派生缓存状态正常（{entry_count} 项）")
        } else {
            format!("{stale_entries} 项派生缓存已过期，界面可能暂时显示旧的扫描结果")
        },
        next_action: if healthy {
            "无需操作".into()
        } else {
            "重新扫描受影响资源以重建派生缓存".into()
        },
        fix_safety: FixSafety::Safe,
    }
}

pub fn scan_health(scanned_resources: usize, failed_resources: usize) -> UnifiedDiagnostic {
    let healthy = failed_resources == 0;
    UnifiedDiagnostic {
        code: if healthy {
            "scan:complete"
        } else {
            "scan:partial"
        }
        .into(),
        kind: DiagnosticKind::Scan,
        severity: if healthy {
            Severity::Info
        } else {
            Severity::Warning
        },
        agent: None,
        scope: None,
        resource_path: None,
        impact: if healthy {
            format!("已完成 {scanned_resources} 项资源扫描")
        } else {
            format!("{failed_resources} 项资源扫描失败，诊断结果可能不完整")
        },
        next_action: if healthy {
            "无需操作".into()
        } else {
            "检查来源和文件权限后重新扫描".into()
        },
        fix_safety: FixSafety::Safe,
    }
}

pub fn recovery_plan(diagnostic: &UnifiedDiagnostic) -> Option<RecoveryPlan> {
    let action = match diagnostic.kind {
        DiagnosticKind::ConfigSyntax => RecoveryAction::EditConfig,
        DiagnosticKind::Permission => RecoveryAction::ReviewPermissions,
        DiagnosticKind::ExternalModification => RecoveryAction::ReloadResource,
        DiagnosticKind::DuplicateSkill => RecoveryAction::ResolveDuplicateSkill,
        DiagnosticKind::SourceUnavailable => {
            if diagnostic.code == "config:file-missing" {
                RecoveryAction::CreateConfig
            } else {
                RecoveryAction::RefreshSkillSource
            }
        }
        DiagnosticKind::VersionMismatch => RecoveryAction::ReviewVersionCompatibility,
        DiagnosticKind::Storage => {
            if diagnostic.severity == Severity::Info {
                return None;
            }
            RecoveryAction::RepairStorage
        }
        DiagnosticKind::Cache | DiagnosticKind::Scan => RecoveryAction::RescanResource,
    };
    let read_only_refresh = matches!(
        action,
        RecoveryAction::RescanResource
            | RecoveryAction::ReloadResource
            | RecoveryAction::RefreshSkillSource
    );
    let safety = if read_only_refresh {
        FixSafety::Safe
    } else {
        diagnostic.fix_safety
    };
    let preview_required = safety == FixSafety::RequiresConfirmation
        || matches!(
            action,
            RecoveryAction::CreateConfig
                | RecoveryAction::EditConfig
                | RecoveryAction::RestoreBackup
                | RecoveryAction::ResolveDuplicateSkill
                | RecoveryAction::RepairStorage
        );
    Some(RecoveryPlan {
        diagnostic_code: diagnostic.code.clone(),
        action,
        resource_path: diagnostic.resource_path.clone(),
        safety,
        preview_required,
        confirmation_required: safety == FixSafety::RequiresConfirmation,
    })
}

/// Execute only actions explicitly marked safe. A caller can pass all visible
/// diagnostics; confirmation-required and manual repairs are never delegated.
pub fn execute_safe_batch<E: RecoveryExecutor>(
    diagnostics: &[UnifiedDiagnostic],
    executor: &mut E,
) -> Vec<Result<RecoveryPlan, E::Error>> {
    diagnostics
        .iter()
        .filter_map(recovery_plan)
        .filter(|plan| plan.safety == FixSafety::Safe)
        .map(|plan| executor.execute(&plan).map(|()| plan))
        .collect()
}

pub fn execute_recovery<E: RecoveryExecutor>(
    plan: &RecoveryPlan,
    approval: RecoveryApproval,
    executor: &mut E,
) -> Result<(), RecoveryExecutionError<E::Error>> {
    authorize_recovery(plan, approval).map_err(RecoveryExecutionError::Policy)?;
    executor
        .execute(plan)
        .map_err(RecoveryExecutionError::Execution)
}

pub fn authorize_recovery(
    plan: &RecoveryPlan,
    approval: RecoveryApproval,
) -> Result<(), RecoveryError> {
    if plan.safety == FixSafety::Manual {
        return Err(RecoveryError::ManualActionRequired);
    }
    if plan.preview_required && !approval.previewed {
        return Err(RecoveryError::PreviewRequired);
    }
    if plan.confirmation_required && !approval.confirmed {
        return Err(RecoveryError::ConfirmationRequired);
    }
    Ok(())
}

#[derive(Debug, PartialEq, Eq)]
pub enum RecoveryExecutionError<E> {
    Policy(RecoveryError),
    Execution(E),
}

pub fn recovery_next_command(action: RecoveryAction) -> Option<&'static str> {
    match action {
        RecoveryAction::CreateConfig | RecoveryAction::EditConfig => Some("preview_config_edit"),
        RecoveryAction::RestoreBackup => Some("preview_config_restore"),
        RecoveryAction::ResolveDuplicateSkill => Some("open_skills_manager"),
        RecoveryAction::RescanResource
        | RecoveryAction::ReloadResource
        | RecoveryAction::RefreshSkillSource
        | RecoveryAction::ReviewVersionCompatibility
        | RecoveryAction::ReviewPermissions
        | RecoveryAction::RepairStorage => None,
    }
}

fn recovery_summary(plan: &RecoveryPlan) -> &'static str {
    match plan.action {
        RecoveryAction::RescanResource => "重新扫描并返回最新诊断",
        RecoveryAction::ReloadResource => "重新加载资源并丢弃过期扫描结果",
        RecoveryAction::CreateConfig => "授权进入配置创建预览；写入仍需走安全编辑命令",
        RecoveryAction::EditConfig => "授权进入配置编辑预览；写入仍需走安全编辑命令",
        RecoveryAction::RestoreBackup => "授权进入备份恢复预览；回滚仍需校验 revision",
        RecoveryAction::ResolveDuplicateSkill => "授权进入重复 Skill 处理流程",
        RecoveryAction::RefreshSkillSource => "重新读取 Skill 并刷新诊断",
        RecoveryAction::ReviewVersionCompatibility => "需要人工核对版本兼容性",
        RecoveryAction::ReviewPermissions => "需要人工检查文件所有者和权限",
        RecoveryAction::RepairStorage => "需要人工检查数据库 migration 和 schema",
    }
}

fn config_code(code: crate::agents::DiagnosticCode) -> &'static str {
    match code {
        crate::agents::DiagnosticCode::FileMissing => "file-missing",
        crate::agents::DiagnosticCode::PermissionDenied => "permission-denied",
        crate::agents::DiagnosticCode::JsonSyntax => "json-syntax",
        crate::agents::DiagnosticCode::JsoncSyntax => "jsonc-syntax",
        crate::agents::DiagnosticCode::TomlSyntax => "toml-syntax",
        crate::agents::DiagnosticCode::SchemaMismatch => "schema-mismatch",
        crate::agents::DiagnosticCode::IoFailure => "io-failure",
    }
}

#[cfg(test)]
mod tests;
