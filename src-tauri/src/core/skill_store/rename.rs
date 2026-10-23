use super::*;

impl SkillStore {
    /// Publish rename metadata together, retaining identity and all memberships.
    pub(crate) fn commit_skill_rename(
        &self,
        previous: &SkillRecord,
        new_name: &str,
        new_path: &std::path::Path,
        hash: &str,
        targets: &[SkillTargetRecord],
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        let path = new_path.to_string_lossy();
        let self_source = matches!(previous.source_type.as_str(), "local" | "import")
            && previous.source_ref.as_deref() == Some(&previous.central_path);
        let source = if self_source {
            Some(path.as_ref())
        } else {
            previous.source_ref.as_deref()
        };
        let changed = tx.execute(
            "UPDATE skills SET name = ?1, central_path = ?2, source_ref = ?3,
             content_hash = ?4, updated_at = ?5 WHERE id = ?6 AND central_path = ?7",
            params![
                new_name,
                path,
                source,
                hash,
                chrono::Utc::now().timestamp_millis(),
                previous.id,
                previous.central_path,
            ],
        )?;
        anyhow::ensure!(
            changed == 1,
            "Skill changed during rename; retry the operation"
        );
        for target in targets {
            let changed = tx.execute(
                "UPDATE skill_targets SET target_path = ?1, mode = ?2, status = 'ok',
                 synced_at = ?3, last_error = NULL, source_hash = ?4
                 WHERE id = ?5 AND skill_id = ?6",
                params![
                    target.target_path,
                    target.mode,
                    chrono::Utc::now().timestamp_millis(),
                    hash,
                    target.id,
                    previous.id,
                ],
            )?;
            anyhow::ensure!(
                changed == 1,
                "Deployment changed during rename; retry the operation"
            );
        }
        tx.commit()?;
        Ok(())
    }
}
