use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

use rusqlite::Connection;
use thiserror::Error;

use crate::{Agent, ConfigFormat, InstallationState, ParseStatus, Scope, SkillKind};

mod config;
mod diagnostics;
mod migration;
mod settings;
mod skill;
mod validation;
mod workspace;

use migration::run_migrations;
use validation::{
    forbidden_schema_columns, parse_domain_value, parse_setting, validate_config_index,
    validate_workspace,
};

#[derive(Debug, Error)]
pub enum PersistenceError {
    #[error("database I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("database query failed: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("database conflict on {field}: {value}")]
    Conflict { field: &'static str, value: String },
    #[error("invalid persistence input: {0}")]
    InvalidInput(String),
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseDiagnostics {
    pub database_path: PathBuf,
    pub schema_version: i64,
    pub journal_mode: String,
    pub foreign_keys_enabled: bool,
    pub forbidden_schema_columns: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewWorkspace {
    pub display_name: String,
    pub entered_path: String,
    pub normalized_path: String,
    pub canonical_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRecord {
    pub id: i64,
    pub display_name: String,
    pub entered_path: String,
    pub normalized_path: String,
    pub canonical_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfigIndex {
    pub agent: Agent,
    pub scope: Scope,
    pub normalized_path: String,
    pub format: ConfigFormat,
    pub checksum: String,
    pub parse_status: ParseStatus,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfigIndexRecord {
    pub id: i64,
    pub index: ConfigIndex,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewConfigBackup {
    pub config_file_id: Option<i64>,
    pub backup_path: String,
    pub original_checksum: String,
    pub operation_type: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewConfigOperation {
    pub config_file_id: Option<i64>,
    pub operation_type: String,
    pub before_checksum: Option<String>,
    pub after_checksum: Option<String>,
    pub backup_id: Option<i64>,
    pub result: String,
    pub diagnostic_code: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigHistoryRecord {
    pub id: i64,
    pub config_file_id: Option<i64>,
    pub agent: Agent,
    pub scope: Scope,
    pub path: String,
    pub format: ConfigFormat,
    pub operation_type: String,
    pub before_checksum: Option<String>,
    pub after_checksum: Option<String>,
    pub backup_id: i64,
    pub backup_path: String,
    pub result: String,
    pub diagnostic_code: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewSkillSource {
    pub source_type: crate::skills::SourceKind,
    pub canonical_locator: String,
    pub manifest_path: Option<String>,
    pub requested_ref: Option<String>,
    pub resolved_commit: Option<String>,
    pub source_fingerprint: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewSkillDescriptor {
    pub source_id: i64,
    pub skill_key: String,
    pub relative_path: String,
    pub entrypoint_path: String,
    pub display_name: String,
    pub description: Option<String>,
    pub kind: SkillKind,
    pub content_fingerprint: Option<String>,
    pub compatibility_json: String,
    pub metadata_json: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewSkillInstallation {
    pub skill_id: i64,
    pub agent: Agent,
    pub scope: Scope,
    pub workspace_id: Option<i64>,
    pub target_path: String,
    pub installed_revision: Option<String>,
    pub installed_fingerprint: Option<String>,
    pub enabled: bool,
    pub state: InstallationState,
    pub managed_files_json: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PersistedSkillInstallation {
    pub source_id: i64,
    pub skill_id: i64,
    pub installation_id: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StorageSummary {
    pub workspaces: i64,
    pub config_files: i64,
    pub config_backups: i64,
    pub config_operations: i64,
    pub skill_sources: i64,
    pub skills: i64,
    pub skill_installations: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Theme {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingKey {
    Theme,
    BackupRetentionDays,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppSetting {
    Theme(Theme),
    BackupRetentionDays(u16),
}

pub trait SettingsRepository {
    fn set_setting(&self, setting: AppSetting) -> Result<(), PersistenceError>;
    fn setting(&self, key: SettingKey) -> Result<Option<AppSetting>, PersistenceError>;
}

pub trait ConfigMetadataRepository: Send + Sync {
    fn upsert_config_index(
        &self,
        workspace_id: Option<i64>,
        config: &ConfigIndex,
    ) -> Result<i64, PersistenceError>;
    fn config_indexes(&self, workspace_id: i64)
        -> Result<Vec<ConfigIndexRecord>, PersistenceError>;
    fn record_backup(&self, backup: &NewConfigBackup) -> Result<i64, PersistenceError>;
    fn record_operation(&self, operation: &NewConfigOperation) -> Result<i64, PersistenceError>;
    fn record_config_change(
        &self,
        backup: &NewConfigBackup,
        operation: &NewConfigOperation,
    ) -> Result<i64, PersistenceError>;
    fn config_history(
        &self,
        normalized_path: Option<&str>,
    ) -> Result<Vec<ConfigHistoryRecord>, PersistenceError>;
    fn config_history_entry(
        &self,
        operation_id: i64,
    ) -> Result<Option<ConfigHistoryRecord>, PersistenceError>;
}

pub trait StorageDiagnosticsRepository: Send + Sync {
    fn diagnostics(&self) -> Result<DatabaseDiagnostics, PersistenceError>;
}

pub trait StorageSummaryRepository {
    fn storage_summary(&self) -> Result<StorageSummary, PersistenceError>;
}

pub trait SkillRepository: Send + Sync {
    fn add_skill_source(&self, source: &NewSkillSource) -> Result<i64, PersistenceError>;
    fn add_skill_descriptor(&self, skill: &NewSkillDescriptor) -> Result<i64, PersistenceError>;
    fn record_skill_installation(
        &self,
        installation: &NewSkillInstallation,
    ) -> Result<i64, PersistenceError>;
    /// Upsert source, descriptor, and installation in one SQLite transaction.
    /// The ID placeholders in `skill` and `installation` are ignored.
    fn save_skill_installation(
        &self,
        source: &NewSkillSource,
        skill: &NewSkillDescriptor,
        installation: &NewSkillInstallation,
    ) -> Result<PersistedSkillInstallation, PersistenceError>;
    fn set_skill_installation_enabled(
        &self,
        target_path: &str,
        enabled: bool,
    ) -> Result<bool, PersistenceError>;
    fn remove_skill_installation(&self, target_path: &str) -> Result<bool, PersistenceError>;
}

pub trait WorkspaceRepository: Send + Sync {
    fn add_workspace(&self, workspace: &NewWorkspace) -> Result<i64, PersistenceError>;
    fn list_workspaces(&self) -> Result<Vec<WorkspaceRecord>, PersistenceError>;
    fn remove_workspace(&self, workspace_id: i64) -> Result<bool, PersistenceError>;
    fn replace_workspace_scan(
        &self,
        workspace: &NewWorkspace,
        configs: &[ConfigIndex],
    ) -> Result<i64, PersistenceError>;
}

pub struct Database {
    path: PathBuf,
    connection: Mutex<Connection>,
}

impl Database {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, PersistenceError> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut connection = Connection::open(&path)?;
        connection.busy_timeout(Duration::from_secs(5))?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        run_migrations(&mut connection)?;

        Ok(Self {
            path,
            connection: Mutex::new(connection),
        })
    }

    pub fn relocate_backup_paths(
        &self,
        previous_root: impl AsRef<Path>,
        current_root: impl AsRef<Path>,
    ) -> Result<usize, PersistenceError> {
        let previous_root = previous_root.as_ref();
        let current_root = current_root.as_ref();
        let mut connection = self.lock_connection()?;
        let transaction = connection.transaction()?;
        let mut statement = transaction.prepare("SELECT id, backup_path FROM config_backups")?;
        let entries = statement
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        drop(statement);

        let mut updated = 0;
        for (id, stored_path) in entries {
            let stored_path = PathBuf::from(stored_path);
            let Ok(relative_path) = stored_path.strip_prefix(previous_root) else {
                continue;
            };
            let relocated = current_root.join(relative_path);
            updated += transaction.execute(
                "UPDATE config_backups SET backup_path = ?1 WHERE id = ?2",
                rusqlite::params![relocated.to_string_lossy(), id],
            )?;
        }
        transaction.commit()?;
        Ok(updated)
    }

    pub fn config_index_count(&self) -> Result<i64, PersistenceError> {
        let connection = self.lock_connection()?;
        Ok(connection.query_row("SELECT COUNT(*) FROM config_files", [], |row| row.get(0))?)
    }

    fn lock_connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, PersistenceError> {
        self.connection
            .lock()
            .map_err(|_| PersistenceError::InvalidInput("database lock poisoned".into()))
    }
}
