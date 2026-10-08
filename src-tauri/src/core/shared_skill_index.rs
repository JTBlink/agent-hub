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
mod tests {
    use super::*;
    use crate::core::{installer, sync_engine};
    #[test]
    fn shared_files_are_registered_in_place_and_direct_deployment_never_deletes_them() {
        let _guard = central_repo::test_base_dir_lock();
        let temp = tempfile::tempdir().unwrap();
        central_repo::set_test_base_dir_override(Some(temp.path().join("app")));
        std::fs::create_dir_all(central_repo::base_dir()).unwrap();
        let root = temp.path().join("shared");
        central_repo::set_runtime_skills_dir_override(Some(root.clone()));
        let skill = root.join("demo");
        std::fs::create_dir_all(&skill).unwrap();
        std::fs::write(skill.join("SKILL.md"), "---\nname: demo\n---\n# Demo").unwrap();
        let store = SkillStore::new(&central_repo::db_path()).unwrap();
        assert!(register_missing(&store).unwrap());
        let id = store.get_all_skills().unwrap()[0].id.clone();
        assert!(!register_missing(&store).unwrap());
        assert_eq!(store.get_all_skills().unwrap()[0].id, id);
        assert_eq!(
            installer::install_from_local(&skill, None)
                .unwrap()
                .central_path,
            skill
        );
        for mode in [sync_engine::SyncMode::Copy, sync_engine::SyncMode::Symlink] {
            sync_engine::preflight_replace(
                &skill,
                &skill,
                mode,
                sync_engine::ReplacePolicy::NoClobber,
            )
            .unwrap();
            sync_engine::sync_skill(&skill, &skill, mode, sync_engine::ReplacePolicy::NoClobber)
                .unwrap();
        }
        for mode in ["copy", "symlink"] {
            assert!(!sync_engine::remove_recorded_target(&skill, mode).unwrap());
        }
        assert!(skill.join("SKILL.md").is_file());
        assert!(!skill.is_symlink());
        central_repo::set_test_base_dir_override(None);
    }
}
