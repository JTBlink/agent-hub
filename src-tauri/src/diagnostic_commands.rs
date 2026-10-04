//! Host configuration and workspace commands; Skills are managed by the independent module.

use super::*;

#[tauri::command]
pub(super) fn collect_diagnostics(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    severity: Option<diagnostics::Severity>,
    agent: Option<Agent>,
    scope: Option<Scope>,
    resource_path: Option<String>,
) -> Result<Vec<diagnostics::UnifiedDiagnostic>, String> {
    let home_directory = app.path().home_dir().map_err(|error| error.to_string())?;
    let collected = collect_all_diagnostics(&home_directory, &state)?;
    Ok(diagnostics::filter_diagnostics(
        &collected,
        &diagnostics::DiagnosticFilter {
            severity,
            agent,
            scope,
            resource_path: resource_path.map(PathBuf::from),
        },
    ))
}

pub(super) fn collect_all_diagnostics(
    home_directory: &Path,
    state: &AppState,
) -> Result<Vec<diagnostics::UnifiedDiagnostic>, String> {
    let context = ScanContext::from_environment(home_directory);
    let documents = [
        ClaudeCodeAdapter.scan_global(&context),
        agents::standard::CodexAdapter.scan_global(&context),
        agents::standard::OpenCodeAdapter.scan_global(&context),
    ];
    let mut collected = documents
        .iter()
        .flat_map(diagnostics::from_config)
        .collect::<Vec<_>>();
    let failed_config_scans = documents
        .iter()
        .filter(|document| {
            document
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code != agents::DiagnosticCode::FileMissing)
        })
        .count();
    collected.push(diagnostics::scan_health(
        documents.len(),
        failed_config_scans,
    ));
    let storage = state
        .storage_diagnostics
        .diagnostics()
        .map_err(|error| error.to_string())?;
    collected.push(diagnostics::storage_health(
        storage.schema_version,
        &storage.forbidden_schema_columns,
    ));
    Ok(collected)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DiagnosticRecoveryRequest {
    pub(super) diagnostic_code: String,
    pub(super) resource_path: Option<String>,
    pub(super) action: Option<diagnostics::RecoveryAction>,
    pub(super) recovery_id: Option<String>,
    pub(super) format: Option<ConfigFormat>,
    pub(super) replacement: Option<String>,
    pub(super) expected_checksum: Option<String>,
    #[serde(default)]
    pub(super) previewed: bool,
    #[serde(default)]
    pub(super) confirmed: bool,
}

pub(super) fn find_recovery_diagnostic<'a>(
    diagnostics: &'a [diagnostics::UnifiedDiagnostic],
    request: &DiagnosticRecoveryRequest,
) -> Result<&'a diagnostics::UnifiedDiagnostic, String> {
    let requested_path = request.resource_path.as_ref().map(PathBuf::from);
    let mut matches = diagnostics.iter().filter(|diagnostic| {
        diagnostic.code == request.diagnostic_code
            && requested_path
                .as_ref()
                .is_none_or(|path| diagnostic.resource_path.as_ref() == Some(path))
    });
    let diagnostic = matches.next().ok_or_else(|| {
        "diagnostic is stale or no longer exists; rescan before recovery".to_owned()
    })?;
    if matches.next().is_some() && requested_path.is_none() {
        return Err("resource_path is required when a diagnostic code is ambiguous".into());
    }
    Ok(diagnostic)
}

pub(super) fn recovery_request_action_matches(
    request: &DiagnosticRecoveryRequest,
    plan: &diagnostics::RecoveryPlan,
) -> Result<(), String> {
    if request
        .action
        .is_some_and(|requested| requested != plan.action)
    {
        return Err("recovery action does not match the current diagnostic".into());
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DiagnosticRecoveryResult {
    pub(super) recovery_id: String,
    pub(super) action: diagnostics::RecoveryAction,
    pub(super) outcome: diagnostics::RecoveryOutcome,
    pub(super) resource_path: Option<PathBuf>,
    pub(super) next_command: Option<String>,
    pub(super) diagnostics: Vec<diagnostics::UnifiedDiagnostic>,
    pub(super) diagnostics_refreshed: bool,
    pub(super) config_write: Option<configuration::ConfigWriteResult>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DiagnosticRecoveryPreview {
    pub(super) recovery_id: String,
    pub(super) plan: diagnostics::RecoveryPlan,
    pub(super) summary: String,
    pub(super) next_command: Option<String>,
    pub(super) config_preview: Option<configuration::ConfigEditPreview>,
}

#[tauri::command]
pub(super) fn preview_diagnostic_recovery(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    request: DiagnosticRecoveryRequest,
) -> Result<DiagnosticRecoveryPreview, String> {
    let home_directory = app.path().home_dir().map_err(|error| error.to_string())?;
    preview_diagnostic_recovery_for_state(&home_directory, &state, request).inspect_err(|_| {
        logging::command_failed(
            logging::Command::PreviewDiagnosticRecovery,
            logging::FailureCode::Diagnostics,
        );
    })
}

pub(super) fn preview_diagnostic_recovery_for_state(
    home_directory: &Path,
    state: &AppState,
    request: DiagnosticRecoveryRequest,
) -> Result<DiagnosticRecoveryPreview, String> {
    let collected = collect_all_diagnostics(home_directory, state)?;
    let diagnostic = find_recovery_diagnostic(&collected, &request)?;
    let preview = {
        let mut registry = state
            .recovery_registry
            .lock()
            .map_err(|_| "diagnostic recovery registry is unavailable".to_owned())?;
        registry
            .preview(diagnostic)
            .ok_or_else(|| "this diagnostic has no automated recovery plan".to_owned())?
    };
    recovery_request_action_matches(&request, &preview.plan)?;

    // For configuration edits, create the same redacted diff used by the
    // dedicated editor. No bytes are written by this command.
    let config_preview = if preview.plan.action == diagnostics::RecoveryAction::EditConfig {
        let path = preview
            .plan
            .resource_path
            .as_ref()
            .ok_or_else(|| "configuration recovery requires a resource path".to_owned())?;
        let authorization = state.authorization(path)?;
        let format = request.format.unwrap_or(authorization.format);
        if format != authorization.format {
            return Err("configuration format does not match the discovered file".into());
        }
        let replacement = request
            .replacement
            .as_deref()
            .ok_or_else(|| "configuration recovery preview requires replacement".to_owned())?;
        Some(
            configuration::preview(path, format, replacement.as_bytes())
                .map_err(|error| error.to_string())?,
        )
    } else {
        None
    };
    if let Some(config_preview) = &config_preview {
        state
            .recovery_registry
            .lock()
            .map_err(|_| "diagnostic recovery registry is unavailable".to_owned())?
            .bind_content_checksum(&preview.recovery_id, config_preview.after_checksum.clone());
    }
    Ok(DiagnosticRecoveryPreview {
        recovery_id: preview.recovery_id,
        plan: preview.plan,
        summary: preview.summary,
        next_command: preview.next_command,
        config_preview,
    })
}

#[tauri::command]
pub(super) fn execute_diagnostic_recovery(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    request: DiagnosticRecoveryRequest,
) -> Result<DiagnosticRecoveryResult, String> {
    let home_directory = app.path().home_dir().map_err(|error| error.to_string())?;
    execute_diagnostic_recovery_for_state(&home_directory, &state, request).inspect_err(|_| {
        logging::command_failed(
            logging::Command::ExecuteDiagnosticRecovery,
            logging::FailureCode::Diagnostics,
        );
    })
}

pub(super) fn execute_diagnostic_recovery_for_state(
    home_directory: &Path,
    state: &AppState,
    request: DiagnosticRecoveryRequest,
) -> Result<DiagnosticRecoveryResult, String> {
    let recovery_id = request
        .recovery_id
        .clone()
        .ok_or_else(|| "recovery_id from preview is required".to_owned())?;
    let plan = state
        .recovery_registry
        .lock()
        .map_err(|_| "diagnostic recovery registry is unavailable".to_owned())?
        .plan(&recovery_id)
        .ok_or_else(|| "recovery preview is missing or already consumed".to_owned())?;
    if plan.diagnostic_code != request.diagnostic_code {
        return Err("recovery preview does not match the requested diagnostic".into());
    }
    if plan.resource_path.as_ref() != request.resource_path.as_ref().map(PathBuf::from).as_ref() {
        return Err("recovery preview does not match the requested resource".into());
    }
    recovery_request_action_matches(&request, &plan)?;
    diagnostics::authorize_recovery(
        &plan,
        diagnostics::RecoveryApproval {
            previewed: request.previewed,
            confirmed: request.confirmed,
        },
    )
    .map_err(|error| error.to_string())?;

    // Keep the approved content outside the lock, then consume the ticket
    // immediately before the first side effect.
    let approved_content_checksum = state
        .recovery_registry
        .lock()
        .map_err(|_| "diagnostic recovery registry is unavailable".to_owned())?
        .content_checksum(&recovery_id);

    let (outcome, config_write) = match plan.action {
        diagnostics::RecoveryAction::RescanResource
        | diagnostics::RecoveryAction::ReloadResource
        | diagnostics::RecoveryAction::RefreshSkillSource => {
            consume_recovery_ticket(state, &recovery_id)?;
            (diagnostics::RecoveryOutcome::Refreshed, None)
        }
        diagnostics::RecoveryAction::EditConfig => {
            consume_recovery_ticket(state, &recovery_id)?;
            let path = plan
                .resource_path
                .as_ref()
                .ok_or_else(|| "configuration recovery requires a resource path".to_owned())?;
            let authorization = state.authorization(path)?;
            let format = request.format.unwrap_or(authorization.format);
            if format != authorization.format {
                return Err("configuration format does not match the discovered file".into());
            }
            let expected_checksum = request.expected_checksum.as_deref().ok_or_else(|| {
                "expected_checksum is required for configuration recovery".to_owned()
            })?;
            let approved_content_checksum = approved_content_checksum.ok_or_else(|| {
                "configuration recovery preview did not include approved content".to_owned()
            })?;
            let replacement = request
                .replacement
                .as_deref()
                .ok_or_else(|| "replacement is required for configuration recovery".to_owned())?;
            let preview = configuration::preview(path, format, replacement.as_bytes())
                .map_err(|error| error.to_string())?;
            if preview.before.checksum != expected_checksum {
                return Err(
                    "configuration changed after preview; reload before executing recovery".into(),
                );
            }
            if preview.after_checksum != approved_content_checksum {
                return Err("replacement does not match the approved recovery preview".into());
            }
            let result = write_config_for_state(
                state,
                path.to_string_lossy().as_ref(),
                format,
                expected_checksum,
                replacement,
            )?;
            (diagnostics::RecoveryOutcome::Applied, Some(result))
        }
        diagnostics::RecoveryAction::CreateConfig
        | diagnostics::RecoveryAction::RestoreBackup
        | diagnostics::RecoveryAction::ResolveDuplicateSkill => {
            return Err("this recovery requires its dedicated review or restore command".into())
        }
        diagnostics::RecoveryAction::ReviewVersionCompatibility
        | diagnostics::RecoveryAction::ReviewPermissions
        | diagnostics::RecoveryAction::RepairStorage => {
            return Err("this recovery requires its dedicated review or restore command".into())
        }
    };
    let refreshed = collect_all_diagnostics(home_directory, state);
    if refreshed.is_err() && config_write.is_none() {
        return Err("recovery scan could not refresh diagnostics".into());
    }
    let diagnostics_refreshed = refreshed.is_ok();
    let diagnostics = refreshed.unwrap_or_default();
    Ok(DiagnosticRecoveryResult {
        recovery_id,
        action: plan.action,
        outcome,
        resource_path: plan.resource_path,
        next_command: None,
        diagnostics,
        diagnostics_refreshed,
        config_write,
    })
}

pub(super) fn consume_recovery_ticket(state: &AppState, recovery_id: &str) -> Result<(), String> {
    let consumed = state
        .recovery_registry
        .lock()
        .map_err(|_| "diagnostic recovery registry is unavailable".to_owned())?
        .complete(recovery_id);
    if consumed {
        Ok(())
    } else {
        Err("recovery preview is missing or already consumed".into())
    }
}
