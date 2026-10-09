use super::*;

impl SkillStore {
    /// Apply an entire membership batch or leave the database unchanged.
    pub fn set_scenario_memberships(
        &self,
        scenario_id: &str,
        skill_ids: &[String],
        add: bool,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        let now = chrono::Utc::now().timestamp_millis();
        for skill_id in skill_ids {
            let exists: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM skills WHERE id = ?1)",
                params![skill_id],
                |row| row.get(0),
            )?;
            if !exists {
                anyhow::bail!("Skill not found: {skill_id}");
            }
            if add {
                tx.execute(
                    "INSERT OR IGNORE INTO scenario_skills (scenario_id, skill_id, added_at) VALUES (?1, ?2, ?3)",
                    params![scenario_id, skill_id, now],
                )?;
            } else {
                tx.execute(
                    "DELETE FROM scenario_skills WHERE scenario_id = ?1 AND skill_id = ?2",
                    params![scenario_id, skill_id],
                )?;
            }
        }
        tx.commit()?;
        Ok(())
    }
}
