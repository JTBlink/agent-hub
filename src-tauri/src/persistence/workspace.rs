use rusqlite::params;

use super::*;

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

    fn remove_workspace(&self, workspace_id: i64) -> Result<bool, PersistenceError> {
        let connection = self.lock_connection()?;
        Ok(connection.execute("DELETE FROM workspaces WHERE id = ?1", [workspace_id])? > 0)
    }

    fn replace_workspace_scan(
        &self,
        workspace: &NewWorkspace,
        configs: &[ConfigIndex],
    ) -> Result<i64, PersistenceError> {
        validate_workspace(workspace)?;
        for config in configs {
            validate_config_index(config)?;
        }
        let mut connection = self.lock_connection()?;
        let transaction = connection.transaction()?;
        let workspace_id = transaction
            .query_row(
                "INSERT INTO workspaces (display_name, entered_path, normalized_path, canonical_path, path_status, last_scanned_at) VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP) ON CONFLICT(normalized_path) DO UPDATE SET display_name = excluded.display_name, entered_path = excluded.entered_path, canonical_path = excluded.canonical_path, path_status = excluded.path_status, last_scanned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP RETURNING id",
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

        transaction.execute(
            "DELETE FROM config_files WHERE workspace_id = ?1",
            [workspace_id],
        )?;

        for config in configs {
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
