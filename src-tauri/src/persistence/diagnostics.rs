use super::*;

impl StorageDiagnosticsRepository for Database {
    fn diagnostics(&self) -> Result<DatabaseDiagnostics, PersistenceError> {
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
}

impl StorageSummaryRepository for Database {
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
