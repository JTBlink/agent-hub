use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

use rusqlite::{params, Connection, OptionalExtension};
use thiserror::Error;

use crate::{Agent, ConfigFormat, InstallationState, ParseStatus, Scope, SkillKind};

#[derive(Debug, Clone, Copy)]
struct Migration {
    version: i64,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    sql: include_str!("../migrations/0001_initial.sql"),
}];

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

#[derive(Debug, Clone, PartialEq, Eq)]
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewSkillSource {
    pub source_type: String,
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

pub trait ConfigMetadataRepository {
    fn config_indexes(&self, workspace_id: i64)
        -> Result<Vec<ConfigIndexRecord>, PersistenceError>;
    fn record_backup(&self, backup: &NewConfigBackup) -> Result<i64, PersistenceError>;
    fn record_operation(&self, operation: &NewConfigOperation) -> Result<i64, PersistenceError>;
    fn storage_summary(&self) -> Result<StorageSummary, PersistenceError>;
}

pub trait SkillRepository {
    fn add_skill_source(&self, source: &NewSkillSource) -> Result<i64, PersistenceError>;
    fn add_skill_descriptor(&self, skill: &NewSkillDescriptor) -> Result<i64, PersistenceError>;
    fn record_skill_installation(
        &self,
        installation: &NewSkillInstallation,
    ) -> Result<i64, PersistenceError>;
}

pub trait WorkspaceRepository {
    fn add_workspace(&self, workspace: &NewWorkspace) -> Result<i64, PersistenceError>;
    fn list_workspaces(&self) -> Result<Vec<WorkspaceRecord>, PersistenceError>;
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

    pub fn diagnostics(&self) -> Result<DatabaseDiagnostics, PersistenceError> {
        let connection = self.lock_connection()?;
        let schema_version = connection.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )?;
        let journal_mode = connection.query_row("PRAGMA journal_mode", [], |row| row.get(0))?;
        let foreign_keys_enabled =
            connection.query_row("PRAGMA foreign_keys", [], |row| row.get::<_, i64>(0))? == 1;
        let forbidden_schema_columns = forbidden_schema_columns(&connection)?;

        Ok(DatabaseDiagnostics {
            database_path: self.path.clone(),
            schema_version,
            journal_mode,
            foreign_keys_enabled,
            forbidden_schema_columns,
        })
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

impl WorkspaceRepository for Database {
    fn add_workspace(&self, workspace: &NewWorkspace) -> Result<i64, PersistenceError> {
        validate_workspace(workspace)?;
        let connection = self.lock_connection()?;
        let result = connection.execute(
            "INSERT INTO workspaces (display_name, entered_path, normalized_path, canonical_path, path_status) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                workspace.display_name,
                workspace.entered_path,
                workspace.normalized_path,
                workspace.canonical_path,
                if workspace.canonical_path.is_some() { "verified" } else { "unverified" },
            ],
        );
        match result {
            Ok(_) => Ok(connection.last_insert_rowid()),
            Err(rusqlite::Error::SqliteFailure(_, Some(message)))
                if message.to_ascii_lowercase().contains("unique") =>
            {
                Err(PersistenceError::Conflict {
                    field: "normalized_path",
                    value: workspace.normalized_path.clone(),
                })
            }
            Err(error) => Err(error.into()),
        }
    }

    fn list_workspaces(&self) -> Result<Vec<WorkspaceRecord>, PersistenceError> {
        let connection = self.lock_connection()?;
        let mut statement = connection.prepare(
            "SELECT id, display_name, entered_path, normalized_path, canonical_path FROM workspaces ORDER BY id",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(WorkspaceRecord {
                id: row.get(0)?,
                display_name: row.get(1)?,
                entered_path: row.get(2)?,
                normalized_path: row.get(3)?,
                canonical_path: row.get(4)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn replace_workspace_scan(
        &self,
        workspace: &NewWorkspace,
        configs: &[ConfigIndex],
    ) -> Result<i64, PersistenceError> {
        validate_workspace(workspace)?;
        let mut connection = self.lock_connection()?;
        let transaction = connection.transaction()?;
        let workspace_id = transaction
            .query_row(
                "INSERT INTO workspaces (display_name, entered_path, normalized_path, canonical_path, path_status, last_scanned_at) VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP) RETURNING id",
                params![
                    workspace.display_name,
                    workspace.entered_path,
                    workspace.normalized_path,
                    workspace.canonical_path,
                    if workspace.canonical_path.is_some() { "verified" } else { "unverified" },
                ],
                |row| row.get(0),
            )
            .map_err(|error| match error {
                rusqlite::Error::SqliteFailure(_, Some(message))
                    if message.to_ascii_lowercase().contains("unique") =>
                {
                    PersistenceError::Conflict {
                        field: "normalized_path",
                        value: workspace.normalized_path.clone(),
                    }
                }
                other => other.into(),
            })?;

        for config in configs {
            validate_config_index(config)?;
            transaction.execute(
                "INSERT INTO config_files (workspace_id, agent, scope, normalized_path, format, checksum, parse_status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    workspace_id,
                    config.agent.as_str(),
                    config.scope.as_str(),
                    config.normalized_path,
                    config.format.as_str(),
                    config.checksum,
                    config.parse_status.as_str(),
                ],
            )?;
        }
        transaction.commit()?;
        Ok(workspace_id)
    }
}

impl ConfigMetadataRepository for Database {
    fn config_indexes(
        &self,
        workspace_id: i64,
    ) -> Result<Vec<ConfigIndexRecord>, PersistenceError> {
        let connection = self.lock_connection()?;
        let mut statement = connection.prepare(
            "SELECT id, agent, scope, normalized_path, format, checksum, parse_status FROM config_files WHERE workspace_id = ?1 ORDER BY id",
        )?;
        let rows = statement.query_map([workspace_id], |row| {
            Ok(ConfigIndexRecord {
                id: row.get(0)?,
                index: ConfigIndex {
                    agent: parse_domain_value(row.get::<_, String>(1)?, 1)?,
                    scope: parse_domain_value(row.get::<_, String>(2)?, 2)?,
                    normalized_path: row.get(3)?,
                    format: parse_domain_value(row.get::<_, String>(4)?, 4)?,
                    checksum: row.get(5)?,
                    parse_status: parse_domain_value(row.get::<_, String>(6)?, 6)?,
                },
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn record_backup(&self, backup: &NewConfigBackup) -> Result<i64, PersistenceError> {
        let connection = self.lock_connection()?;
        connection.execute(
            "INSERT INTO config_backups (config_file_id, backup_path, original_checksum, operation_type) VALUES (?1, ?2, ?3, ?4)",
            params![
                backup.config_file_id,
                backup.backup_path,
                backup.original_checksum,
                backup.operation_type,
            ],
        )?;
        Ok(connection.last_insert_rowid())
    }

    fn record_operation(&self, operation: &NewConfigOperation) -> Result<i64, PersistenceError> {
        let connection = self.lock_connection()?;
        connection.execute(
            "INSERT INTO config_operations (config_file_id, operation_type, before_checksum, after_checksum, backup_id, result, diagnostic_code) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                operation.config_file_id,
                operation.operation_type,
                operation.before_checksum,
                operation.after_checksum,
                operation.backup_id,
                operation.result,
                operation.diagnostic_code,
            ],
        )?;
        Ok(connection.last_insert_rowid())
    }

    fn storage_summary(&self) -> Result<StorageSummary, PersistenceError> {
        let connection = self.lock_connection()?;
        let count = |table: &str| -> Result<i64, PersistenceError> {
            Ok(
                connection.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })?,
            )
        };
        Ok(StorageSummary {
            workspaces: count("workspaces")?,
            config_files: count("config_files")?,
            config_backups: count("config_backups")?,
            config_operations: count("config_operations")?,
            skill_sources: count("skill_sources")?,
            skills: count("skills")?,
            skill_installations: count("skill_installations")?,
        })
    }
}

impl SkillRepository for Database {
    fn add_skill_source(&self, source: &NewSkillSource) -> Result<i64, PersistenceError> {
        if source.source_type.trim().is_empty() || source.canonical_locator.trim().is_empty() {
            return Err(PersistenceError::InvalidInput(
                "Skill source type and locator are required".into(),
            ));
        }
        let connection = self.lock_connection()?;
        connection.execute(
            "INSERT INTO skill_sources (source_type, canonical_locator, manifest_path, requested_ref, resolved_commit, source_fingerprint) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                source.source_type,
                source.canonical_locator,
                source.manifest_path,
                source.requested_ref,
                source.resolved_commit,
                source.source_fingerprint,
            ],
        )?;
        Ok(connection.last_insert_rowid())
    }

    fn add_skill_descriptor(&self, skill: &NewSkillDescriptor) -> Result<i64, PersistenceError> {
        if skill.entrypoint_path.is_empty() || skill.display_name.trim().is_empty() {
            return Err(PersistenceError::InvalidInput(
                "Skill entrypoint and display name are required".into(),
            ));
        }
        let connection = self.lock_connection()?;
        connection.execute(
            "INSERT INTO skills (source_id, skill_key, relative_path, entrypoint_path, display_name, description, kind, content_fingerprint, compatibility_json, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                skill.source_id,
                skill.skill_key,
                skill.relative_path,
                skill.entrypoint_path,
                skill.display_name,
                skill.description,
                skill.kind.as_str(),
                skill.content_fingerprint,
                skill.compatibility_json,
                skill.metadata_json,
            ],
        )?;
        Ok(connection.last_insert_rowid())
    }

    fn record_skill_installation(
        &self,
        installation: &NewSkillInstallation,
    ) -> Result<i64, PersistenceError> {
        let connection = self.lock_connection()?;
        connection.execute(
            "INSERT INTO skill_installations (skill_id, agent, scope, workspace_id, target_path, installed_revision, installed_fingerprint, enabled, state, managed_files_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                installation.skill_id,
                installation.agent.as_str(),
                installation.scope.as_str(),
                installation.workspace_id,
                installation.target_path,
                installation.installed_revision,
                installation.installed_fingerprint,
                installation.enabled as i64,
                installation.state.as_str(),
                installation.managed_files_json,
            ],
        )?;
        Ok(connection.last_insert_rowid())
    }
}

impl SettingsRepository for Database {
    fn set_setting(&self, setting: AppSetting) -> Result<(), PersistenceError> {
        let (key, value) = match setting {
            AppSetting::Theme(theme) => (
                "theme",
                match theme {
                    Theme::System => "system".to_owned(),
                    Theme::Light => "light".to_owned(),
                    Theme::Dark => "dark".to_owned(),
                },
            ),
            AppSetting::BackupRetentionDays(days) if (1..=365).contains(&days) => {
                ("backupRetentionDays", days.to_string())
            }
            AppSetting::BackupRetentionDays(days) => {
                return Err(PersistenceError::InvalidInput(format!(
                    "backup retention days must be between 1 and 365, got {days}"
                )))
            }
        };
        let connection = self.lock_connection()?;
        connection.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
            params![key, value],
        )?;
        Ok(())
    }

    fn setting(&self, key: SettingKey) -> Result<Option<AppSetting>, PersistenceError> {
        let key_name = match key {
            SettingKey::Theme => "theme",
            SettingKey::BackupRetentionDays => "backupRetentionDays",
        };
        let connection = self.lock_connection()?;
        let value: Option<String> = connection
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                [key_name],
                |row| row.get(0),
            )
            .optional()?;
        value.map(|value| parse_setting(key, &value)).transpose()
    }
}

fn validate_workspace(workspace: &NewWorkspace) -> Result<(), PersistenceError> {
    if workspace.display_name.trim().is_empty() {
        return Err(PersistenceError::InvalidInput(
            "workspace display name cannot be empty".into(),
        ));
    }
    if workspace.normalized_path.trim().is_empty() {
        return Err(PersistenceError::InvalidInput(
            "workspace normalized path cannot be empty".into(),
        ));
    }
    Ok(())
}

fn validate_config_index(config: &ConfigIndex) -> Result<(), PersistenceError> {
    if config.scope != Scope::Workspace {
        return Err(PersistenceError::InvalidInput(
            "workspace scans only accept workspace-scoped configs".into(),
        ));
    }
    Ok(())
}

fn parse_domain_value<T>(value: String, column: usize) -> rusqlite::Result<T>
where
    T: std::str::FromStr,
    T::Err: std::error::Error + Send + Sync + 'static,
{
    value.parse().map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            column,
            rusqlite::types::Type::Text,
            Box::new(error),
        )
    })
}

fn parse_setting(key: SettingKey, value: &str) -> Result<AppSetting, PersistenceError> {
    match key {
        SettingKey::Theme => match value {
            "system" => Ok(AppSetting::Theme(Theme::System)),
            "light" => Ok(AppSetting::Theme(Theme::Light)),
            "dark" => Ok(AppSetting::Theme(Theme::Dark)),
            other => Err(PersistenceError::InvalidInput(format!(
                "invalid stored theme: {other}"
            ))),
        },
        SettingKey::BackupRetentionDays => value
            .parse::<u16>()
            .map(AppSetting::BackupRetentionDays)
            .map_err(|_| {
                PersistenceError::InvalidInput(format!(
                    "invalid stored backup retention days: {value}"
                ))
            }),
    }
}

fn forbidden_schema_columns(connection: &Connection) -> Result<Vec<String>, PersistenceError> {
    const FORBIDDEN: &[&str] = &[
        "config_content",
        "content",
        "credential",
        "password",
        "raw_content",
        "secret",
        "token",
    ];
    let mut statement = connection.prepare(
        "SELECT schema.name, columns.name FROM sqlite_schema AS schema JOIN pragma_table_info(schema.name) AS columns WHERE schema.type = 'table' ORDER BY schema.name, columns.cid",
    )?;
    let columns = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut violations = Vec::new();
    for column in columns {
        let (table, name) = column?;
        if FORBIDDEN.contains(&name.to_ascii_lowercase().as_str()) {
            violations.push(format!("{table}.{name}"));
        }
    }
    Ok(violations)
}

fn run_migrations(connection: &mut Connection) -> Result<(), PersistenceError> {
    apply_migrations(connection, MIGRATIONS)
}

fn apply_migrations(
    connection: &mut Connection,
    migrations: &[Migration],
) -> Result<(), PersistenceError> {
    if migrations
        .windows(2)
        .any(|pair| pair[0].version >= pair[1].version)
        || migrations.iter().any(|migration| migration.version <= 0)
    {
        return Err(PersistenceError::InvalidInput(
            "migration versions must be positive, unique, and strictly increasing".into(),
        ));
    }

    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    )?;

    let mut statement = connection.prepare("SELECT version FROM schema_migrations")?;
    let applied = statement
        .query_map([], |row| row.get::<_, i64>(0))?
        .collect::<Result<std::collections::HashSet<_>, _>>()?;
    drop(statement);

    if let Some(unknown) = applied.iter().find(|version| {
        !migrations
            .iter()
            .any(|migration| migration.version == **version)
    }) {
        return Err(PersistenceError::InvalidInput(format!(
            "database contains unknown migration version {unknown}"
        )));
    }

    for migration in migrations {
        if applied.contains(&migration.version) {
            continue;
        }
        let transaction = connection.transaction()?;
        transaction.execute_batch(migration.sql)?;
        transaction.execute(
            "INSERT INTO schema_migrations (version) VALUES (?1)",
            [migration.version],
        )?;
        transaction.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod migration_tests {
    use super::*;

    const TEST_MIGRATIONS: &[Migration] = &[
        Migration {
            version: 1,
            sql: "CREATE TABLE example (id INTEGER PRIMARY KEY);",
        },
        Migration {
            version: 2,
            sql: "ALTER TABLE example ADD COLUMN name TEXT;",
        },
    ];

    #[test]
    fn applies_all_pending_migrations_once_in_version_order() {
        let mut connection = Connection::open_in_memory().expect("database opens");

        apply_migrations(&mut connection, TEST_MIGRATIONS).expect("migrations apply");
        apply_migrations(&mut connection, TEST_MIGRATIONS).expect("migrations are idempotent");

        let applied = connection
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
                row.get::<_, i64>(0)
            })
            .expect("migration count loads");
        let has_name = connection
            .prepare("SELECT name FROM example")
            .expect("second migration added the column")
            .column_count();
        assert_eq!(applied, 2);
        assert_eq!(has_name, 1);
    }

    #[test]
    fn rejects_unknown_or_out_of_order_migration_versions() {
        let mut connection = Connection::open_in_memory().expect("database opens");
        let invalid = [TEST_MIGRATIONS[1], TEST_MIGRATIONS[0]];
        assert!(matches!(
            apply_migrations(&mut connection, &invalid),
            Err(PersistenceError::InvalidInput(_))
        ));

        connection
            .execute_batch(
                "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); INSERT INTO schema_migrations (version) VALUES (99);",
            )
            .expect("future schema is created");
        assert!(matches!(
            apply_migrations(&mut connection, TEST_MIGRATIONS),
            Err(PersistenceError::InvalidInput(_))
        ));
    }
}
