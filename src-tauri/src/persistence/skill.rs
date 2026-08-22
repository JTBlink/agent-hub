use super::*;

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
            rusqlite::params![
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
}
