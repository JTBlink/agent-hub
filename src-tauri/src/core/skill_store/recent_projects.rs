//! Bounded recent history; project registrations remain valid for open windows and skills.
use super::*;

const RECENT_PROJECT_LIMIT: i64 = 15;

fn prune(conn: &Connection) -> Result<()> {
    conn.execute(
        "UPDATE projects SET visited_at = 0 WHERE id IN (
            SELECT id FROM projects
            WHERE workspace_type = 'project' AND (visited_at IS NULL OR visited_at > 0)
            ORDER BY COALESCE(visited_at, updated_at) DESC, created_at DESC, id ASC
            LIMIT -1 OFFSET ?1
        )",
        params![RECENT_PROJECT_LIMIT],
    )?;
    Ok(())
}

impl SkillStore {
    /// Lightweight metadata for synchronizing history without rescanning project skills.
    pub fn project_visit_history(&self) -> Result<Vec<(String, Option<i64>)>> {
        Ok(self
            .get_all_projects()?
            .into_iter()
            .map(|p| (p.id, p.visited_at))
            .collect())
    }

    /// Zero marks an evicted history entry; NULL keeps legacy entries eligible until pruned.
    pub fn prune_recent_projects(&self) -> Result<()> {
        prune(&self.conn.lock().unwrap())
    }

    /// Reopening restores an evicted entry and evicts only the oldest history metadata.
    pub fn touch_project_visited(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "UPDATE projects SET visited_at = MAX(?1,
                COALESCE((SELECT MAX(visited_at) + 1 FROM projects), ?1)) WHERE id = ?2",
            params![chrono::Utc::now().timestamp_millis(), id],
        )?;
        prune(&tx)?;
        tx.commit()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests;
