use std::{fs, path::PathBuf};

use agent_hub_lib::{
    configuration::{self, ConfigWriteResult, ConfigurationError},
    diagnostics::{
        self, execute_recovery, FixSafety, RecoveryAction, RecoveryApproval,
        RecoveryExecutionError, RecoveryExecutor, RecoveryPlan,
    },
    Agent, ConfigFormat, Scope,
};
use tempfile::tempdir;

struct RollbackExecutor {
    path: PathBuf,
    backup_path: PathBuf,
    backup_root: PathBuf,
    expected_checksum: String,
    result: Option<ConfigWriteResult>,
}

impl RecoveryExecutor for RollbackExecutor {
    type Error = ConfigurationError;

    fn execute(&mut self, plan: &RecoveryPlan) -> Result<(), Self::Error> {
        assert_eq!(plan.action, RecoveryAction::RestoreBackup);
        self.result = Some(configuration::rollback(
            &self.path,
            ConfigFormat::Json,
            &self.expected_checksum,
            &self.backup_path,
            &self.backup_root,
        )?);
        Ok(())
    }
}

#[test]
fn confirmed_restore_recovers_a_real_file_and_preserves_the_replaced_revision() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("settings.json");
    let backup_root = directory.path().join("private-backups");
    let initial = b"{\"theme\":\"system\"}\n";
    let replacement = b"{\"theme\":\"dark\"}\n";
    fs::write(&path, initial).expect("initial config is written");

    let edit_preview = configuration::preview(&path, ConfigFormat::Json, replacement)
        .expect("edit preview is valid");
    let edit = configuration::write_atomically(
        &path,
        ConfigFormat::Json,
        &edit_preview.before.checksum,
        replacement,
        &backup_root,
    )
    .expect("edit is written and backed up");
    let backup_content = fs::read(&edit.backup_path).expect("backup is readable");
    let restore_preview = configuration::preview(&path, ConfigFormat::Json, &backup_content)
        .expect("restore preview is valid");
    assert!(restore_preview.changed);
    assert!(!restore_preview.diff.is_empty());

    let plan = RecoveryPlan {
        diagnostic_code: "config:restore-backup".into(),
        action: RecoveryAction::RestoreBackup,
        resource_path: Some(path.clone()),
        safety: FixSafety::RequiresConfirmation,
        preview_required: true,
        confirmation_required: true,
    };
    let mut executor = RollbackExecutor {
        path: path.clone(),
        backup_path: edit.backup_path,
        backup_root,
        expected_checksum: edit.after.checksum,
        result: None,
    };

    assert!(matches!(
        execute_recovery(&plan, RecoveryApproval::default(), &mut executor),
        Err(RecoveryExecutionError::Policy(_))
    ));
    assert_eq!(
        fs::read(&path).expect("config remains readable"),
        replacement
    );
    assert!(executor.result.is_none());

    execute_recovery(
        &plan,
        RecoveryApproval {
            previewed: true,
            confirmed: true,
        },
        &mut executor,
    )
    .expect("confirmed rollback succeeds");

    let rollback = executor.result.expect("rollback result is captured");
    assert_eq!(
        fs::read(&path).expect("restored config is readable"),
        initial
    );
    assert_eq!(
        fs::read(rollback.backup_path).expect("replaced revision is backed up"),
        replacement
    );
}

#[test]
fn external_change_cancels_write_and_becomes_a_safe_actionable_diagnostic() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("config.toml");
    let backup_root = directory.path().join("private-backups");
    fs::write(&path, "model = \"first\"\n").expect("initial config is written");
    let preview = configuration::preview(&path, ConfigFormat::Toml, b"model = \"proposed\"\n")
        .expect("preview succeeds");

    fs::write(&path, "model = \"external\"\n").expect("external editor changes file");
    let error = configuration::write_atomically(
        &path,
        ConfigFormat::Toml,
        &preview.before.checksum,
        b"model = \"proposed\"\n",
        backup_root,
    )
    .expect_err("stale write is rejected");
    let diagnostic =
        diagnostics::from_configuration_error(&error, Agent::Codex, Scope::Global, &path);

    assert!(matches!(error, ConfigurationError::ExternalModified { .. }));
    assert_eq!(diagnostic.code, "config:external-modification");
    assert_eq!(diagnostic.resource_path.as_deref(), Some(path.as_path()));
    assert_eq!(fs::read_to_string(path).unwrap(), "model = \"external\"\n");
}
