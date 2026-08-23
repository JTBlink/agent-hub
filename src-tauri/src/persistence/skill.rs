use rusqlite::OptionalExtension;

use super::*;

impl SkillRepository for Database {
    fn add_skill_source(&self, source: &NewSkillSource) -> Result<i64, PersistenceError> {
        if source.canonical_locator.trim().is_empty() {
            return Err(PersistenceError::InvalidInput(
                "Skill source type and locator are required".into(),
            ));
        }
        let connection = self.lock_connection()?;
        connection.execute(
            "INSERT INTO skill_sources (source_type, canonical_locator, manifest_path, requested_ref, resolved_commit, source_fingerprint) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                source.source_type.as_str(),
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
            rusqlite::params![
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
            rusqlite::params![
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

    fn save_skill_installation(
        &self,
        source: &NewSkillSource,
        skill: &NewSkillDescriptor,
        installation: &NewSkillInstallation,
    ) -> Result<PersistedSkillInstallation, PersistenceError> {
        if source.canonical_locator.trim().is_empty()
            || skill.skill_key.trim().is_empty()
            || skill.display_name.trim().is_empty()
            || installation.target_path.trim().is_empty()
        {
            return Err(PersistenceError::InvalidInput(
                "source, Skill and installation identifiers are required".into(),
            ));
        }
        if (installation.scope == crate::Scope::Global) != installation.workspace_id.is_none() {
            return Err(PersistenceError::InvalidInput(
                "global Skill installations cannot reference a workspace".into(),
            ));
        }
        let mut connection = self.lock_connection()?;
        let transaction = connection.transaction()?;
        transaction.execute(
            "INSERT OR IGNORE INTO skill_sources (source_type, canonical_locator, manifest_path, requested_ref, resolved_commit, source_fingerprint) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                source.source_type.as_str(),
                source.canonical_locator,
                source.manifest_path,
                source.requested_ref,
                source.resolved_commit,
                source.source_fingerprint,
            ],
        )?;
        let source_id = transaction.query_row(
            "SELECT id FROM skill_sources WHERE source_type = ?1 AND canonical_locator = ?2 AND requested_ref IS ?3",
            rusqlite::params![source.source_type.as_str(), source.canonical_locator, source.requested_ref],
            |row| row.get(0),
        )?;
        transaction.execute(
            "UPDATE skill_sources SET manifest_path = ?1, resolved_commit = ?2, source_fingerprint = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?4",
            rusqlite::params![source.manifest_path, source.resolved_commit, source.source_fingerprint, source_id],
        )?;
        let skill_id = transaction.query_row(
            "INSERT INTO skills (source_id, skill_key, relative_path, entrypoint_path, display_name, description, kind, content_fingerprint, compatibility_json, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) ON CONFLICT(skill_key) DO UPDATE SET source_id = excluded.source_id, relative_path = excluded.relative_path, entrypoint_path = excluded.entrypoint_path, display_name = excluded.display_name, description = excluded.description, kind = excluded.kind, content_fingerprint = excluded.content_fingerprint, compatibility_json = excluded.compatibility_json, metadata_json = excluded.metadata_json RETURNING id",
            rusqlite::params![
                source_id,
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
            |row| row.get(0),
        )?;
        let existing_target = transaction
            .query_row(
                "SELECT id, skill_id FROM skill_installations WHERE agent = ?1 AND scope = ?2 AND ((workspace_id IS NULL AND ?3 IS NULL) OR workspace_id = ?3) AND target_path = ?4",
                rusqlite::params![installation.agent.as_str(), installation.scope.as_str(), installation.workspace_id, installation.target_path],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
            )
            .optional()?;
        if existing_target.is_some_and(|(_, existing_skill_id)| existing_skill_id != skill_id) {
            return Err(PersistenceError::Conflict {
                field: "target_path",
                value: installation.target_path.clone(),
            });
        }
        let installation_id = if let Some((id, _)) = existing_target {
            transaction.execute(
                "UPDATE skill_installations SET installed_revision = ?1, installed_fingerprint = ?2, enabled = ?3, state = ?4, managed_files_json = ?5 WHERE id = ?6",
                rusqlite::params![installation.installed_revision, installation.installed_fingerprint, installation.enabled as i64, installation.state.as_str(), installation.managed_files_json, id],
            )?;
            id
        } else {
            transaction.execute(
                "INSERT INTO skill_installations (skill_id, agent, scope, workspace_id, target_path, installed_revision, installed_fingerprint, enabled, state, managed_files_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                rusqlite::params![skill_id, installation.agent.as_str(), installation.scope.as_str(), installation.workspace_id, installation.target_path, installation.installed_revision, installation.installed_fingerprint, installation.enabled as i64, installation.state.as_str(), installation.managed_files_json],
            )?;
            transaction.last_insert_rowid()
        };
        transaction.commit()?;
        Ok(PersistedSkillInstallation {
            source_id,
            skill_id,
            installation_id,
        })
    }

    fn set_skill_installation_enabled(
        &self,
        target_path: &str,
        enabled: bool,
    ) -> Result<bool, PersistenceError> {
        let connection = self.lock_connection()?;
        Ok(connection.execute(
            "UPDATE skill_installations SET enabled = ?1, state = ?2 WHERE target_path = ?3",
            rusqlite::params![
                enabled as i64,
                if enabled { "installed" } else { "disabled" },
                target_path
            ],
        )? > 0)
    }

    fn remove_skill_installation(&self, target_path: &str) -> Result<bool, PersistenceError> {
        let connection = self.lock_connection()?;
        Ok(connection.execute(
            "DELETE FROM skill_installations WHERE target_path = ?1",
            [target_path],
        )? > 0)
    }
}
