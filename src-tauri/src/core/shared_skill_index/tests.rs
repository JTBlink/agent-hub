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
        sync_engine::preflight_replace(&skill, &skill, mode, sync_engine::ReplacePolicy::NoClobber)
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
