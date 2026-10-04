use super::*;
use crate::diagnostic_commands::*;

#[test]
fn host_diagnostics_leave_skill_directories_to_the_skills_module() {
    let root = tempfile::tempdir().unwrap();
    let skill = root.path().join(".agents/skills/demo/SKILL.md");
    std::fs::create_dir_all(skill.parent().unwrap()).unwrap();
    std::fs::write(&skill, "invalid legacy skill metadata").unwrap();
    let state = test_state(root.path());
    let diagnostics = collect_all_diagnostics(root.path(), &state).unwrap();
    assert!(diagnostics
        .iter()
        .all(|item| !item.code.starts_with("skill:")));
    assert_eq!(
        std::fs::read_to_string(skill).unwrap(),
        "invalid legacy skill metadata"
    );
}

#[test]
fn package_smoke_covers_scan_write_and_migration_contract() {
    run_package_smoke().expect("package smoke checks");
}

struct EnvironmentGuard {
    key: &'static str,
    original: Option<std::ffi::OsString>,
}

impl EnvironmentGuard {
    fn set(key: &'static str, value: &Path) -> Self {
        let original = std::env::var_os(key);
        std::env::set_var(key, value);
        Self { key, original }
    }
}

impl Drop for EnvironmentGuard {
    fn drop(&mut self) {
        if let Some(value) = self.original.take() {
            std::env::set_var(self.key, value);
        } else {
            std::env::remove_var(self.key);
        }
    }
}

fn test_state(root: &Path) -> AppState {
    let database = Arc::new(
        persistence::Database::open(root.join("state/agent-hub.sqlite3")).expect("database"),
    );
    let workspace_repository: Arc<dyn WorkspaceRepository> = database.clone();
    let config_repository: Arc<dyn ConfigMetadataRepository> = database.clone();
    let storage_repository: Arc<dyn StorageDiagnosticsRepository> = database.clone();
    AppState::new(
        workspace_repository,
        config_repository,
        storage_repository,
        root.join("backups"),
    )
}

#[test]
fn exposes_application_metadata() {
    assert_eq!(
        app_info(),
        AppInfo {
            name: "AgentHub",
            version: env!("CARGO_PKG_VERSION"),
        }
    );
}

#[test]
fn workspace_input_is_canonical_and_instruction_scan_is_read_only() {
    let root = tempfile::tempdir().expect("workspace");
    std::fs::write(root.path().join("AGENTS.md"), "# Rules").expect("instruction");
    std::fs::create_dir(root.path().join("nested")).expect("nested directory");
    std::fs::write(root.path().join("nested/CLAUDE.local.md"), "# Local")
        .expect("nested instruction");
    let input = workspace_input(&root.path().to_string_lossy()).expect("workspace input");
    assert_eq!(
        input.canonical_path.as_deref(),
        Some(
            root.path()
                .canonicalize()
                .expect("canonical")
                .to_string_lossy()
                .as_ref()
        )
    );
    let instructions = discover_instruction_files(root.path());
    assert_eq!(instructions.len(), 2);
    assert!(root.path().join("AGENTS.md").is_file());
}

#[cfg(unix)]
#[test]
fn workspace_input_rejects_symbolic_links() {
    use std::os::unix::fs::symlink;
    let root = tempfile::tempdir().expect("workspace");
    let link = root.path().with_extension("link");
    symlink(root.path(), &link).expect("symlink");
    assert!(workspace_input(&link.to_string_lossy()).is_err());
    std::fs::remove_file(link).expect("remove link");
}

#[test]
fn instruction_scan_skips_generated_directories_and_stops_at_budget() {
    let root = tempfile::tempdir().expect("workspace");
    for ignored in [".git", "node_modules", "target", "dist"] {
        let directory = root.path().join(ignored);
        std::fs::create_dir_all(&directory).expect("ignored directory");
        std::fs::write(directory.join("AGENTS.md"), "must not be scanned")
            .expect("ignored instruction");
    }
    std::fs::create_dir(root.path().join("src")).expect("source directory");
    std::fs::write(root.path().join("src/AGENTS.md"), "valid").expect("instruction");
    assert_eq!(discover_instruction_files(root.path()).len(), 1);

    let limited = discover_instruction_files_with_limits(root.path(), 16, 2, 500);
    assert!(limited.len() <= 2);
    let capped = discover_instruction_files_with_limits(root.path(), 16, 20_000, 0);
    assert!(capped.is_empty());
}

#[test]
fn diagnostic_recovery_commands_enforce_preview_confirmation_and_one_time_use() {
    let root = tempfile::tempdir().expect("home");
    let codex_directory = root.path().join(".codex");
    std::fs::create_dir(&codex_directory).expect("Codex directory");
    let _codex_home = EnvironmentGuard::set("CODEX_HOME", &codex_directory);
    let path = codex_directory.join("config.toml");
    std::fs::write(&path, "model = [\n").expect("invalid config");
    let state = test_state(root.path());
    let document = agents::standard::CodexAdapter.scan_global(&ScanContext::new(root.path()));
    register_global_config(&state, &document).expect("configuration registered");
    let replacement = "model = \"gpt-5\"\n";

    let preview = preview_diagnostic_recovery_for_state(
        root.path(),
        &state,
        DiagnosticRecoveryRequest {
            diagnostic_code: "config:toml-syntax".into(),
            resource_path: Some(path.to_string_lossy().into_owned()),
            action: Some(diagnostics::RecoveryAction::EditConfig),
            recovery_id: None,
            format: Some(ConfigFormat::Toml),
            replacement: Some(replacement.into()),
            expected_checksum: None,
            previewed: false,
            confirmed: false,
        },
    )
    .expect("recovery preview");
    let config_preview = preview
        .config_preview
        .as_ref()
        .expect("redacted config diff is returned");
    assert!(config_preview.changed);
    assert!(!config_preview.diff.is_empty());

    let execute_request = |previewed, confirmed| DiagnosticRecoveryRequest {
        diagnostic_code: "config:toml-syntax".into(),
        resource_path: Some(path.to_string_lossy().into_owned()),
        action: Some(diagnostics::RecoveryAction::EditConfig),
        recovery_id: Some(preview.recovery_id.clone()),
        format: Some(ConfigFormat::Toml),
        replacement: Some(replacement.into()),
        expected_checksum: Some(config_preview.before.checksum.clone()),
        previewed,
        confirmed,
    };
    assert!(execute_diagnostic_recovery_for_state(
        root.path(),
        &state,
        execute_request(false, false)
    )
    .unwrap_err()
    .contains("previewed"));
    assert!(execute_diagnostic_recovery_for_state(
        root.path(),
        &state,
        execute_request(true, false)
    )
    .unwrap_err()
    .contains("confirmation"));

    let mut changed_after_preview = execute_request(true, true);
    changed_after_preview.replacement = Some("model = \"different\"\n".into());
    assert!(
        execute_diagnostic_recovery_for_state(root.path(), &state, changed_after_preview)
            .unwrap_err()
            .contains("approved recovery preview")
    );
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "model = [\n");

    let retry_preview = preview_diagnostic_recovery_for_state(
        root.path(),
        &state,
        DiagnosticRecoveryRequest {
            diagnostic_code: "config:toml-syntax".into(),
            resource_path: Some(path.to_string_lossy().into_owned()),
            action: Some(diagnostics::RecoveryAction::EditConfig),
            recovery_id: None,
            format: Some(ConfigFormat::Toml),
            replacement: Some(replacement.into()),
            expected_checksum: None,
            previewed: false,
            confirmed: false,
        },
    )
    .expect("recovery can be previewed again after a rejected attempt");
    let retry_checksum = retry_preview
        .config_preview
        .as_ref()
        .unwrap()
        .before
        .checksum
        .clone();
    let result = execute_diagnostic_recovery_for_state(
        root.path(),
        &state,
        DiagnosticRecoveryRequest {
            diagnostic_code: "config:toml-syntax".into(),
            resource_path: Some(path.to_string_lossy().into_owned()),
            action: Some(diagnostics::RecoveryAction::EditConfig),
            recovery_id: Some(retry_preview.recovery_id.clone()),
            format: Some(ConfigFormat::Toml),
            replacement: Some(replacement.into()),
            expected_checksum: Some(retry_checksum.clone()),
            previewed: true,
            confirmed: true,
        },
    )
    .expect("confirmed recovery executes");
    assert_eq!(result.outcome, diagnostics::RecoveryOutcome::Applied);
    assert!(result.diagnostics_refreshed);
    assert!(result.config_write.is_some());
    assert_eq!(std::fs::read_to_string(&path).unwrap(), replacement);
    assert!(execute_diagnostic_recovery_for_state(
        root.path(),
        &state,
        DiagnosticRecoveryRequest {
            diagnostic_code: "config:toml-syntax".into(),
            resource_path: Some(path.to_string_lossy().into_owned()),
            action: Some(diagnostics::RecoveryAction::EditConfig),
            recovery_id: Some(retry_preview.recovery_id),
            format: Some(ConfigFormat::Toml),
            replacement: Some(replacement.into()),
            expected_checksum: Some(retry_checksum),
            previewed: true,
            confirmed: true,
        }
    )
    .unwrap_err()
    .contains("already consumed"));
}

#[test]
fn safe_recovery_rescans_without_confirmation_and_manual_recovery_is_rejected() {
    let root = tempfile::tempdir().expect("home");
    let opencode_directory = root.path().join(".config/opencode");
    std::fs::create_dir_all(&opencode_directory).expect("OpenCode directory");
    let path = opencode_directory.join("opencode.json");
    std::fs::write(&path, r#"{"$schema":7}"#).expect("schema mismatch config");
    let state = test_state(root.path());

    let safe_preview = preview_diagnostic_recovery_for_state(
        root.path(),
        &state,
        DiagnosticRecoveryRequest {
            diagnostic_code: "scan:partial".into(),
            resource_path: None,
            action: Some(diagnostics::RecoveryAction::RescanResource),
            recovery_id: None,
            format: None,
            replacement: None,
            expected_checksum: None,
            previewed: false,
            confirmed: false,
        },
    )
    .expect("safe scan preview");
    let safe_result = execute_diagnostic_recovery_for_state(
        root.path(),
        &state,
        DiagnosticRecoveryRequest {
            diagnostic_code: "scan:partial".into(),
            resource_path: None,
            action: Some(diagnostics::RecoveryAction::RescanResource),
            recovery_id: Some(safe_preview.recovery_id),
            format: None,
            replacement: None,
            expected_checksum: None,
            previewed: false,
            confirmed: false,
        },
    )
    .expect("safe rescan executes without confirmation");
    assert_eq!(safe_result.outcome, diagnostics::RecoveryOutcome::Refreshed);
    assert!(safe_result.diagnostics_refreshed);

    let manual_preview = preview_diagnostic_recovery_for_state(
        root.path(),
        &state,
        DiagnosticRecoveryRequest {
            diagnostic_code: "config:schema-mismatch".into(),
            resource_path: Some(path.to_string_lossy().into_owned()),
            action: Some(diagnostics::RecoveryAction::ReviewVersionCompatibility),
            recovery_id: None,
            format: None,
            replacement: None,
            expected_checksum: None,
            previewed: false,
            confirmed: false,
        },
    )
    .expect("manual recovery is explainable");
    let error = execute_diagnostic_recovery_for_state(
        root.path(),
        &state,
        DiagnosticRecoveryRequest {
            diagnostic_code: "config:schema-mismatch".into(),
            resource_path: Some(path.to_string_lossy().into_owned()),
            action: Some(diagnostics::RecoveryAction::ReviewVersionCompatibility),
            recovery_id: Some(manual_preview.recovery_id),
            format: None,
            replacement: None,
            expected_checksum: None,
            previewed: true,
            confirmed: true,
        },
    )
    .expect_err("manual recovery never auto-executes");
    assert!(error.contains("manually"));
}

#[test]
fn removing_a_workspace_only_revokes_authorization_and_keeps_files() {
    let root = tempfile::tempdir().expect("workspace");
    let codex_directory = root.path().join(".codex");
    std::fs::create_dir(&codex_directory).expect("Codex directory");
    let config_path = codex_directory.join("config.toml");
    std::fs::write(&config_path, "model = \"gpt-5\"\n").expect("config");
    let workspace = workspace_input(&root.path().to_string_lossy()).expect("workspace input");
    let database = Arc::new(
        persistence::Database::open(root.path().join("state/agent-hub.sqlite3")).expect("database"),
    );
    let document = agents::standard::CodexAdapter.scan_workspace(root.path());
    let workspace_id = database
        .replace_workspace_scan(&workspace, &[config_index(&document)])
        .expect("scan is indexed");
    let config_id = database.config_indexes(workspace_id).expect("index loads")[0].id;
    let workspace_repository: Arc<dyn WorkspaceRepository> = database.clone();
    let config_repository: Arc<dyn ConfigMetadataRepository> = database.clone();
    let storage_repository: Arc<dyn StorageDiagnosticsRepository> = database;
    let state = AppState::new(
        workspace_repository,
        config_repository,
        storage_repository,
        root.path().join("backups"),
    );
    state.authorize(&document, config_id).expect("authorized");

    assert!(remove_workspace_record(&state, workspace_id).expect("remove record"));

    assert!(root.path().is_dir());
    assert_eq!(
        std::fs::read_to_string(&config_path).expect("config remains"),
        "model = \"gpt-5\"\n"
    );
    assert!(state.authorization(&config_path).is_err());
}

#[test]
fn history_persistence_failure_compensates_the_file_write() {
    let root = tempfile::tempdir().expect("workspace");
    let codex_directory = root.path().join(".codex");
    std::fs::create_dir(&codex_directory).expect("Codex directory");
    let config_path = codex_directory.join("config.toml");
    std::fs::write(&config_path, "model = \"before\"\n").expect("config");
    let workspace = workspace_input(&root.path().to_string_lossy()).expect("workspace input");
    let database = Arc::new(
        persistence::Database::open(root.path().join("state/agent-hub.sqlite3")).expect("database"),
    );
    let document = agents::standard::CodexAdapter.scan_workspace(root.path());
    let workspace_id = database
        .replace_workspace_scan(&workspace, &[config_index(&document)])
        .expect("scan is indexed");
    let config_id = database.config_indexes(workspace_id).expect("index loads")[0].id;
    let workspace_repository: Arc<dyn WorkspaceRepository> = database.clone();
    let config_repository: Arc<dyn ConfigMetadataRepository> = database.clone();
    let storage_repository: Arc<dyn StorageDiagnosticsRepository> = database.clone();
    let backup_root = root.path().join("backups").join(config_id.to_string());
    let state = AppState::new(
        workspace_repository,
        config_repository,
        storage_repository,
        root.path().join("backups"),
    );
    // Simulate a database record disappearing between authorization and history persistence.
    database
        .remove_workspace(workspace_id)
        .expect("remove index directly");
    let result = configuration::write_atomically(
        &config_path,
        ConfigFormat::Toml,
        document.checksum.as_deref().expect("checksum"),
        b"model = \"after\"\n",
        &backup_root,
    )
    .expect("filesystem phase");

    let error = record_config_change_or_restore(
        &state,
        config_id,
        "edit",
        &result,
        &config_path,
        ConfigFormat::Toml,
        &backup_root,
    )
    .expect_err("missing index prevents history persistence");

    assert!(error.contains("configuration was restored"));
    assert_eq!(
        std::fs::read_to_string(&config_path).expect("restored config"),
        "model = \"before\"\n"
    );
}
