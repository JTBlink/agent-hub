use super::*;

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
}
