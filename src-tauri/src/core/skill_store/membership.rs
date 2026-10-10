use super::*;

impl SkillStore {
    /// Apply an entire membership batch or leave the database unchanged.
    ///
    /// Group membership is **exclusive**: each skill belongs to at most one
    /// group.  When `add` is true the skill is first removed from any other
    /// group it currently belongs to (within the same transaction) before the
    /// insert.  The set of displaced scenario-ids is returned so the caller
    /// can update the corresponding metadata files.
    pub fn set_scenario_memberships(
        &self,
        scenario_id: &str,
        skill_ids: &[String],
        add: bool,
    ) -> Result<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        let now = chrono::Utc::now().timestamp_millis();
        let mut displaced_scenarios: Vec<String> = Vec::new();
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
                let mut stmt = tx.prepare(
                    "SELECT scenario_id FROM scenario_skills WHERE skill_id = ?1 AND scenario_id != ?2",
                )?;
                let old: Vec<String> = stmt
                    .query_map(params![skill_id, scenario_id], |row| row.get(0))?
                    .filter_map(|r| r.ok())
                    .collect();
                displaced_scenarios.extend(old);
                tx.execute(
                    "DELETE FROM scenario_skills WHERE skill_id = ?1 AND scenario_id != ?2",
                    params![skill_id, scenario_id],
                )?;
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
        displaced_scenarios.sort_unstable();
        displaced_scenarios.dedup();
        Ok(displaced_scenarios)
    }
}
