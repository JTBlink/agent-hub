use rusqlite::OptionalExtension;

use super::*;

impl ConfigMetadataRepository for Database {
    fn upsert_config_index(
        &self,
        workspace_id: Option<i64>,
        config: &ConfigIndex,
    ) -> Result<i64, PersistenceError> {
        validate_config_index_scope(workspace_id, config)?;
        let mut connection = self.lock_connection()?;
        let transaction = connection.transaction()?;
        let existing = transaction
            .query_row(
                "SELECT id FROM config_files WHERE workspace_id IS ?1 AND agent = ?2 AND scope = ?3 AND normalized_path = ?4",
                rusqlite::params![
                    workspace_id,
                    config.agent.as_str(),
                    config.scope.as_str(),
                    config.normalized_path,
                ],
                |row| row.get::<_, i64>(0),
            )
            .optional()?;
        let id = if let Some(id) = existing {
            transaction.execute(
                "UPDATE config_files SET format = ?1, checksum = ?2, parse_status = ?3 WHERE id = ?4",
                rusqlite::params![
                    config.format.as_str(),
                    config.checksum,
                    config.parse_status.as_str(),
                    id,
                ],
            )?;
            id
        } else {
            transaction.execute(
                "INSERT INTO config_files (workspace_id, agent, scope, normalized_path, format, checksum, parse_status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    workspace_id,
                    config.agent.as_str(),
                    config.scope.as_str(),
                    config.normalized_path,
                    config.format.as_str(),
                    config.checksum,
                    config.parse_status.as_str(),
                ],
            )?;
            transaction.last_insert_rowid()
        };
        transaction.commit()?;
        Ok(id)
    }

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
            rusqlite::params![
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
            rusqlite::params![
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

    fn record_config_change(
        &self,
        backup: &NewConfigBackup,
        operation: &NewConfigOperation,
    ) -> Result<i64, PersistenceError> {
        if backup.config_file_id != operation.config_file_id {
            return Err(PersistenceError::InvalidInput(
                "backup and operation must refer to the same configuration".into(),
            ));
        }
        let Some(config_file_id) = backup.config_file_id else {
            return Err(PersistenceError::InvalidInput(
                "configuration history requires an indexed configuration".into(),
            ));
        };
        let mut connection = self.lock_connection()?;
        let transaction = connection.transaction()?;
        let (agent, scope, target_path, format) = transaction.query_row(
            "SELECT agent, scope, normalized_path, format FROM config_files WHERE id = ?1",
            [config_file_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )?;
        transaction.execute(
            "INSERT INTO config_backups (config_file_id, backup_path, original_checksum, operation_type) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                backup.config_file_id,
                backup.backup_path,
                backup.original_checksum,
                backup.operation_type,
            ],
        )?;
        let backup_id = transaction.last_insert_rowid();
        transaction.execute(
            "INSERT INTO config_operations (config_file_id, operation_type, before_checksum, after_checksum, backup_id, result, diagnostic_code, target_path, agent, scope, format) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                operation.config_file_id,
                operation.operation_type,
                operation.before_checksum,
                operation.after_checksum,
                backup_id,
                operation.result,
                operation.diagnostic_code,
                target_path,
                agent,
                scope,
                format,
            ],
        )?;
        let operation_id = transaction.last_insert_rowid();
        if let Some(after_checksum) = operation.after_checksum.as_deref() {
            transaction.execute(
                "UPDATE config_files SET checksum = ?1 WHERE id = ?2",
                rusqlite::params![after_checksum, config_file_id],
            )?;
        }
        transaction.commit()?;
        Ok(operation_id)
    }

    fn config_history(
        &self,
        normalized_path: Option<&str>,
    ) -> Result<Vec<ConfigHistoryRecord>, PersistenceError> {
        let connection = self.lock_connection()?;
        let mut statement = connection.prepare(
            "SELECT operations.id, operations.config_file_id, COALESCE(operations.agent, files.agent), COALESCE(operations.scope, files.scope), COALESCE(operations.target_path, files.normalized_path), COALESCE(operations.format, files.format), operations.operation_type, operations.before_checksum, operations.after_checksum, backups.id, backups.backup_path, operations.result, operations.diagnostic_code, operations.created_at FROM config_operations AS operations LEFT JOIN config_files AS files ON files.id = operations.config_file_id JOIN config_backups AS backups ON backups.id = operations.backup_id WHERE COALESCE(operations.agent, files.agent) IS NOT NULL AND COALESCE(operations.scope, files.scope) IS NOT NULL AND COALESCE(operations.target_path, files.normalized_path) IS NOT NULL AND COALESCE(operations.format, files.format) IS NOT NULL AND (?1 IS NULL OR COALESCE(operations.target_path, files.normalized_path) = ?1) ORDER BY operations.id DESC",
        )?;
        let rows = statement.query_map([normalized_path], map_history_record)?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn config_history_entry(
        &self,
        operation_id: i64,
    ) -> Result<Option<ConfigHistoryRecord>, PersistenceError> {
        let connection = self.lock_connection()?;
        connection
            .query_row(
                "SELECT operations.id, operations.config_file_id, COALESCE(operations.agent, files.agent), COALESCE(operations.scope, files.scope), COALESCE(operations.target_path, files.normalized_path), COALESCE(operations.format, files.format), operations.operation_type, operations.before_checksum, operations.after_checksum, backups.id, backups.backup_path, operations.result, operations.diagnostic_code, operations.created_at FROM config_operations AS operations LEFT JOIN config_files AS files ON files.id = operations.config_file_id JOIN config_backups AS backups ON backups.id = operations.backup_id WHERE operations.id = ?1 AND COALESCE(operations.agent, files.agent) IS NOT NULL AND COALESCE(operations.scope, files.scope) IS NOT NULL AND COALESCE(operations.target_path, files.normalized_path) IS NOT NULL AND COALESCE(operations.format, files.format) IS NOT NULL",
                [operation_id],
                map_history_record,
            )
            .optional()
            .map_err(Into::into)
    }
}

fn validate_config_index_scope(
    workspace_id: Option<i64>,
    config: &ConfigIndex,
) -> Result<(), PersistenceError> {
    if matches!(
        (workspace_id, config.scope),
        (None, Scope::Global) | (Some(_), Scope::Workspace)
    ) {
        Ok(())
    } else {
        Err(PersistenceError::InvalidInput(
            "configuration scope does not match its workspace association".into(),
        ))
    }
}

fn map_history_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<ConfigHistoryRecord> {
    Ok(ConfigHistoryRecord {
        id: row.get(0)?,
        config_file_id: row.get(1)?,
        agent: parse_domain_value(row.get::<_, String>(2)?, 2)?,
        scope: parse_domain_value(row.get::<_, String>(3)?, 3)?,
        path: row.get(4)?,
        format: parse_domain_value(row.get::<_, String>(5)?, 5)?,
        operation_type: row.get(6)?,
        before_checksum: row.get(7)?,
        after_checksum: row.get(8)?,
        backup_id: row.get(9)?,
        backup_path: row.get(10)?,
        result: row.get(11)?,
        diagnostic_code: row.get(12)?,
        created_at: row.get(13)?,
    })
}
