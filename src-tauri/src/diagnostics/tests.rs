use super::*;
use crate::{
    agents::{ConfigStatus, Diagnostic, DiagnosticCode},
    ConfigFormat,
};
use serde_json::Value;

#[derive(Default)]
struct RecordingExecutor {
    actions: Vec<RecoveryAction>,
}

impl RecoveryExecutor for RecordingExecutor {
    type Error = &'static str;

    fn execute(&mut self, plan: &RecoveryPlan) -> Result<(), Self::Error> {
        self.actions.push(plan.action);
        Ok(())
    }
}

fn diagnostic(code: &str, kind: DiagnosticKind, safety: FixSafety) -> UnifiedDiagnostic {
    UnifiedDiagnostic {
        code: code.into(),
        kind,
        severity: Severity::Warning,
        agent: Some(Agent::Codex),
        scope: Some(Scope::Workspace),
        resource_path: Some("/workspace/.codex/config.toml".into()),
        impact: "impact".into(),
        next_action: "next".into(),
        fix_safety: safety,
    }
}

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
    assert_eq!(diagnostics[0].code, "config:toml-syntax");
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

#[test]
fn filters_by_severity_agent_scope_and_exact_resource() {
    let selected = diagnostic(
        "config:selected",
        DiagnosticKind::ConfigSyntax,
        FixSafety::RequiresConfirmation,
    );
    let mut other_path = selected.clone();
    other_path.code = "config:other-path".into();
    other_path.resource_path = Some("/workspace/other.toml".into());
    let mut other_agent = selected.clone();
    other_agent.code = "config:other-agent".into();
    other_agent.agent = Some(Agent::ClaudeCode);

    let filtered = filter_diagnostics(
        &[selected.clone(), other_path, other_agent],
        &DiagnosticFilter {
            severity: Some(Severity::Warning),
            agent: Some(Agent::Codex),
            scope: Some(Scope::Workspace),
            resource_path: selected.resource_path.clone(),
        },
    );

    assert_eq!(filtered, vec![selected]);
}

#[test]
fn external_modification_is_actionable_without_exposing_checksums() {
    let error = ConfigurationError::ExternalModified {
        expected: "expected-secret-revision".into(),
        actual: "actual-secret-revision".into(),
    };
    let diagnostic = from_configuration_error(
        &error,
        Agent::OpenCode,
        Scope::Global,
        "~/.config/opencode/opencode.json",
    );
    let serialized = serde_json::to_string(&diagnostic).expect("diagnostic serializes");

    assert_eq!(diagnostic.kind, DiagnosticKind::ExternalModification);
    assert_eq!(diagnostic.fix_safety, FixSafety::RequiresConfirmation);
    assert!(diagnostic.next_action.contains("Diff"));
    assert!(!serialized.contains("expected-secret-revision"));
    assert!(!serialized.contains("actual-secret-revision"));
}

#[test]
fn schema_mismatch_maps_to_manual_version_review() {
    let document = ConfigDocument {
        agent: Agent::ClaudeCode,
        scope: Scope::Global,
        format: ConfigFormat::Json,
        path: "~/.claude/settings.json".into(),
        status: ConfigStatus::Invalid,
        checksum: None,
        modified_at_ms: None,
        structured_view: Value::Null,
        source_preview: String::new(),
        diagnostics: vec![Diagnostic {
            code: DiagnosticCode::SchemaMismatch,
            message: "unknown field".into(),
            line: None,
            column: None,
        }],
    };
    let diagnostics = from_config(&document);
    assert_eq!(diagnostics[0].kind, DiagnosticKind::VersionMismatch);
    assert_eq!(diagnostics[0].fix_safety, FixSafety::Manual);
    assert_eq!(diagnostics[0].code, "config:schema-mismatch");
}

#[test]
fn dangerous_recovery_requires_preview_and_confirmation() {
    let diagnostic = diagnostic(
        "config:json-syntax",
        DiagnosticKind::ConfigSyntax,
        FixSafety::RequiresConfirmation,
    );
    let plan = recovery_plan(&diagnostic).expect("recovery is available");
    let mut executor = RecordingExecutor::default();

    assert_eq!(
        execute_recovery(&plan, RecoveryApproval::default(), &mut executor),
        Err(RecoveryExecutionError::Policy(
            RecoveryError::PreviewRequired
        ))
    );
    assert_eq!(
        execute_recovery(
            &plan,
            RecoveryApproval {
                previewed: true,
                confirmed: false,
            },
            &mut executor,
        ),
        Err(RecoveryExecutionError::Policy(
            RecoveryError::ConfirmationRequired
        ))
    );
    assert!(executor.actions.is_empty());

    execute_recovery(
        &plan,
        RecoveryApproval {
            previewed: true,
            confirmed: true,
        },
        &mut executor,
    )
    .expect("confirmed recovery executes");
    assert_eq!(executor.actions, vec![RecoveryAction::EditConfig]);
}

#[test]
fn safe_batch_never_executes_confirmation_or_manual_actions() {
    let safe_cache = cache_health(4, 2);
    let safe_scan = scan_health(10, 1);
    let dangerous = diagnostic(
        "skill:duplicate-name:review",
        DiagnosticKind::DuplicateSkill,
        FixSafety::RequiresConfirmation,
    );
    let manual = version_mismatch(Agent::Codex, Scope::Workspace, None, "review");
    let mut executor = RecordingExecutor::default();

    let outcomes = execute_safe_batch(&[safe_cache, safe_scan, dangerous, manual], &mut executor);

    assert_eq!(outcomes.len(), 2);
    assert!(outcomes.iter().all(Result::is_ok));
    assert_eq!(
        executor.actions,
        vec![
            RecoveryAction::RescanResource,
            RecoveryAction::RescanResource
        ]
    );
}

#[test]
fn health_diagnostics_do_not_expose_sensitive_storage_details() {
    let diagnostics = [
        storage_health(3, &[]),
        cache_health(0, 0),
        scan_health(6, 0),
    ];
    let serialized = serde_json::to_string(&diagnostics).expect("diagnostics serialize");

    assert!(diagnostics
        .iter()
        .all(|diagnostic| diagnostic.resource_path.is_none()));
    assert!(!serialized.contains("sqlite"));
    assert!(!serialized.contains("token"));
    assert!(!serialized.contains("secret"));
}

#[test]
fn recovery_registry_issues_one_time_bounded_preview_tickets() {
    let diagnostic = diagnostic(
        "config:external-modification",
        DiagnosticKind::ExternalModification,
        FixSafety::RequiresConfirmation,
    );
    let mut registry = RecoveryRegistry::default();
    let preview = registry.preview(&diagnostic).expect("preview plan");
    assert_eq!(preview.plan.action, RecoveryAction::ReloadResource);
    assert_eq!(preview.plan.safety, FixSafety::Safe);
    assert!(!preview.plan.preview_required);
    assert!(!preview.plan.confirmation_required);
    assert_eq!(
        registry.plan(&preview.recovery_id),
        Some(preview.plan.clone())
    );
    assert!(registry.complete(&preview.recovery_id));
    assert!(!registry.complete(&preview.recovery_id));
    assert!(registry.plan(&preview.recovery_id).is_none());
}

#[test]
fn manual_permission_recovery_is_never_authorized() {
    let diagnostic = diagnostic(
        "config:permission-denied",
        DiagnosticKind::Permission,
        FixSafety::Manual,
    );
    let plan = recovery_plan(&diagnostic).expect("manual plan is explainable");
    assert_eq!(plan.action, RecoveryAction::ReviewPermissions);
    assert_eq!(
        authorize_recovery(
            &plan,
            RecoveryApproval {
                previewed: true,
                confirmed: true,
            }
        ),
        Err(RecoveryError::ManualActionRequired)
    );
}
