//! Register skills installed by other tools directly in the shared library.
use super::{
    central_repo, content_hash, scanner, skill_metadata,
    skill_store::{SkillRecord, SkillStore},
};
use anyhow::Result;
use std::collections::HashSet;

pub(super) fn is_shared() -> bool {
    central_repo::skills_dir() == central_repo::default_skills_dir()
}

pub(super) fn refresh(store: &SkillStore) -> Result<bool> {
    if !is_shared() {
        return Ok(false);
    }
    register_missing(store)
}

/// Register existing skill directories without copying or replacing files.
pub(crate) fn register_missing(store: &SkillStore) -> Result<bool> {
    let existing: HashSet<_> = store
        .get_all_skills()?
        .into_iter()
        .map(|skill| skill.central_path)
        .collect();
    let mut changed = false;
    for path in scanner::collect_skill_dirs(&central_repo::skills_dir()) {
        let central_path = path.to_string_lossy().into_owned();
        if existing.contains(&central_path) {
            continue;
        }
        let metadata = skill_metadata::parse_skill_md(&path);
        let now = chrono::Utc::now().timestamp_millis();
        store.insert_skill(&SkillRecord {
            id: uuid::Uuid::new_v4().to_string(),
            name: skill_metadata::infer_skill_name(&path),
            description: metadata.description,
            source_type: "local".into(),
            source_ref: None,
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            source_agent: None,
            remote_revision: None,
            central_path,
            content_hash: Some(content_hash::hash_directory(&path)?),
            enabled: true,
            created_at: now,
            updated_at: now,
            status: "ok".into(),
            update_status: "local_only".into(),
            last_checked_at: None,
            last_check_error: None,
        })?;
        changed = true;
    }
    Ok(changed)
}

#[cfg(test)]
mod tests;
