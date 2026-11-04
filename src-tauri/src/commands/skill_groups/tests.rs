mod membership_tests;
use super::*;
#[cfg(unix)]
use crate::core::scenario_service::{
    collect_scenario_sync_targets, sync_desired_targets, unsync_obsolete_scenario_targets,
};
use crate::core::skill_store::SkillRecord;
use crate::core::tool_adapters::{self, CustomToolDef};
use std::fs;
#[cfg(unix)]
use std::os::unix::fs::MetadataExt;
use std::path::PathBuf;
use std::sync::MutexGuard;
use tempfile::tempdir;
use tempfile::TempDir;

struct MetadataTestRepo {
    _lock: MutexGuard<'static, ()>,
    _tmp: TempDir,
    store: SkillStore,
}

impl Drop for MetadataTestRepo {
    fn drop(&mut self) {
        crate::core::central_repo::set_test_base_dir_override(None);
    }
}

fn metadata_test_repo() -> MetadataTestRepo {
    let lock = crate::core::central_repo::test_base_dir_lock();
    let tmp = tempdir().unwrap();
    let base = tmp.path().join("repo");
    crate::core::central_repo::set_test_base_dir_override(Some(base.clone()));
    fs::create_dir_all(crate::core::central_repo::skills_dir()).unwrap();
    let store = SkillStore::new(&base.join("test.db")).unwrap();
    MetadataTestRepo {
        _lock: lock,
        _tmp: tmp,
        store,
    }
}

fn sample_skill(id: &str, name: &str, central_path: &std::path::Path) -> SkillRecord {
    SkillRecord {
        id: id.to_string(),
        name: name.to_string(),
        description: None,
        source_type: "import".to_string(),
        source_ref: Some(central_path.to_string_lossy().to_string()),
        source_ref_resolved: None,
        source_subpath: None,
        source_branch: None,
        source_revision: None,
        source_agent: None,
        remote_revision: None,
        central_path: central_path.to_string_lossy().to_string(),
        content_hash: None,
        enabled: true,
        created_at: 1,
        updated_at: 1,
        status: "ok".to_string(),
        update_status: "local_only".to_string(),
        last_checked_at: None,
        last_check_error: None,
    }
}

fn sample_scenario(id: &str, name: &str) -> ScenarioRecord {
    ScenarioRecord {
        id: id.to_string(),
        name: name.to_string(),
        description: None,
        icon: None,
        sort_order: 0,
        created_at: 1,
        updated_at: 1,
    }
}

fn write_skill_dir(base: &std::path::Path, name: &str) -> PathBuf {
    let dir = base.join(name);
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("SKILL.md"), format!("---\nname: {name}\n---\n")).unwrap();
    dir
}

fn configure_single_custom_tool(store: &SkillStore, target_base: &std::path::Path) {
    let custom_tools = vec![CustomToolDef {
        key: "test_agent".to_string(),
        display_name: "Test Agent".to_string(),
        skills_dir: target_base.to_string_lossy().to_string(),
        project_relative_skills_dir: None,
        category: Default::default(),
    }];
    store
        .set_setting(
            "custom_tools",
            &serde_json::to_string(&custom_tools).unwrap(),
        )
        .unwrap();
    let disabled_builtin_tools: Vec<String> = tool_adapters::default_tool_adapters()
        .into_iter()
        .map(|adapter| adapter.key)
        .collect();
    store
        .set_setting(
            "disabled_tools",
            &serde_json::to_string(&disabled_builtin_tools).unwrap(),
        )
        .unwrap();
}

#[test]
fn organization_crud_does_not_switch_or_deploy_skill_groups() {
    let repo = metadata_test_repo();
    repo.store
        .insert_scenario(&sample_scenario("current", "Current"))
        .unwrap();
    repo.store.set_active_scenario("current").unwrap();

    let created =
        create_skill_group_internal(&repo.store, "  Web Dev  ", Some(" Frontend work "), None)
            .unwrap();
    assert_eq!(created.name, "Web Dev");
    assert_eq!(created.description.as_deref(), Some("Frontend work"));
    assert_eq!(
        repo.store.get_active_scenario_id().unwrap().as_deref(),
        Some("current")
    );
    assert!(repo.store.get_all_targets().unwrap().is_empty());

    delete_skill_group_internal(&repo.store, &created.id).unwrap();
    assert_eq!(
        repo.store.get_active_scenario_id().unwrap().as_deref(),
        Some("current")
    );

    delete_skill_group_internal(&repo.store, "current").unwrap();
    assert_eq!(repo.store.get_active_scenario_id().unwrap(), None);
    assert!(repo.store.get_all_targets().unwrap().is_empty());
}

#[cfg(unix)]
#[test]
fn switching_scenarios_keeps_overlapping_skill_target() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
    let source_base = tmp.path().join("central");
    let target_base = tmp.path().join("agent-skills");
    fs::create_dir_all(&source_base).unwrap();
    fs::create_dir_all(&target_base).unwrap();

    configure_single_custom_tool(&store, &target_base);

    store
        .insert_scenario(&sample_scenario("old", "Old"))
        .unwrap();
    store
        .insert_scenario(&sample_scenario("new", "New"))
        .unwrap();

    let shared_dir = write_skill_dir(&source_base, "shared");
    let old_only_dir = write_skill_dir(&source_base, "old-only");
    let new_only_dir = write_skill_dir(&source_base, "new-only");
    store
        .insert_skill(&sample_skill("shared", "shared", &shared_dir))
        .unwrap();
    store
        .insert_skill(&sample_skill("old-only", "old-only", &old_only_dir))
        .unwrap();
    store
        .insert_skill(&sample_skill("new-only", "new-only", &new_only_dir))
        .unwrap();

    // Exclusive: each skill belongs to exactly one group.
    store.add_skill_to_scenario("old", "shared").unwrap();
    store.add_skill_to_scenario("old", "old-only").unwrap();
    store.add_skill_to_scenario("new", "new-only").unwrap();

    store.set_active_scenario("old").unwrap();
    sync_scenario_skills(&store, "old", false).unwrap();

    let shared_target = target_base.join("shared");
    let old_only_target = target_base.join("old-only");
    let new_only_target = target_base.join("new-only");
    assert_eq!(fs::read_link(&shared_target).unwrap(), shared_dir);
    assert!(old_only_target.is_symlink());
    let shared_inode_before = fs::symlink_metadata(&shared_target).unwrap().ino();

    // Now move "shared" from "old" to "new" (exclusive: removes from old).
    store.add_skill_to_scenario("new", "shared").unwrap();
    assert!(
        store
            .get_skill_ids_for_scenario("old")
            .unwrap()
            .iter()
            .all(|id| id != "shared"),
        "exclusive add should remove shared from old"
    );

    let desired_targets = collect_scenario_sync_targets(&store, "new").unwrap();
    unsync_obsolete_scenario_targets(&store, "old", &desired_targets).unwrap();
    store.set_active_scenario("new").unwrap();
    sync_desired_targets(&store, &desired_targets, false).unwrap();

    assert_eq!(fs::read_link(&shared_target).unwrap(), shared_dir);
    assert_eq!(
        fs::symlink_metadata(&shared_target).unwrap().ino(),
        shared_inode_before
    );
    assert!(!old_only_target.exists());
    assert_eq!(fs::read_link(&new_only_target).unwrap(), new_only_dir);

    let targets = store.get_all_targets().unwrap();
    assert_eq!(targets.len(), 2);
    assert!(targets
        .iter()
        .any(|target| target.skill_id == "shared" && target.tool == "test_agent"));
    assert!(targets
        .iter()
        .any(|target| target.skill_id == "new-only" && target.tool == "test_agent"));
}

#[test]
fn scenario_sync_keeps_duplicate_skill_names_separate() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
    let source_base = tmp.path().join("central");
    let target_base = tmp.path().join("agent-skills");
    fs::create_dir_all(&source_base).unwrap();
    fs::create_dir_all(&target_base).unwrap();
    configure_single_custom_tool(&store, &target_base);
    store.set_setting("sync_mode", "copy").unwrap();

    store
        .insert_scenario(&sample_scenario("active", "Active"))
        .unwrap();

    let first_dir = write_skill_dir(&source_base, "skill123");
    let second_dir = write_skill_dir(&source_base, "skill123-2");
    fs::write(first_dir.join("unique.txt"), "first").unwrap();
    fs::write(second_dir.join("unique.txt"), "second").unwrap();

    store
        .insert_skill(&sample_skill("first", "skill123", &first_dir))
        .unwrap();
    store
        .insert_skill(&sample_skill("second", "skill123", &second_dir))
        .unwrap();
    store.add_skill_to_scenario("active", "first").unwrap();
    store.add_skill_to_scenario("active", "second").unwrap();

    sync_scenario_skills(&store, "active", false).unwrap();

    assert_eq!(
        fs::read_to_string(target_base.join("skill123/unique.txt")).unwrap(),
        "first"
    );
    assert_eq!(
        fs::read_to_string(target_base.join("skill123-2/unique.txt")).unwrap(),
        "second"
    );
    let targets = store.get_all_targets().unwrap();
    assert!(targets
        .iter()
        .any(|target| { target.skill_id == "first" && target.target_path.ends_with("skill123") }));
    assert!(targets.iter().any(|target| {
        target.skill_id == "second" && target.target_path.ends_with("skill123-2")
    }));
}
