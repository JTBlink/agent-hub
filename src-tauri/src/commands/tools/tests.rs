use super::*;
use crate::core::skill_store::{ScenarioRecord, SkillRecord, SkillTargetRecord};
use std::fs;
use tempfile::tempdir;

/// #378: a user names a custom agent after one that later ships built-in.
/// The key is derived from the display name, so "DeepSeek Harness" becomes
/// `deepseek_harness` — and the collision check at creation time only knew
/// the keys that existed then. Resolution now prefers the built-in, so a
/// write that landed on the custom definition was stored where nothing
/// reads it: the save reported success and the path never moved.
fn store_with_colliding_custom_tool(dir: &std::path::Path, key: &str) -> SkillStore {
    let store = SkillStore::new(&dir.join("test.db")).unwrap();
    let customs = vec![CustomToolDef {
        key: key.to_string(),
        display_name: "DeepSeek Harness".to_string(),
        skills_dir: "/tmp/whatever-they-had".to_string(),
        project_relative_skills_dir: Some(".old/skills".to_string()),
        category: ToolCategory::Coding,
    }];
    store
        .set_setting("custom_tools", &serde_json::to_string(&customs).unwrap())
        .unwrap();
    store
}

#[test]
fn a_path_edit_survives_a_custom_tool_shadowed_by_a_builtin() {
    let tmp = tempdir().unwrap();
    let store = store_with_colliding_custom_tool(tmp.path(), "deepseek_harness");
    let chosen = tmp.path().join("chosen");

    apply_tool_skills_dir(&store, "deepseek_harness", &chosen.to_string_lossy()).unwrap();

    let adapter = tool_adapters::find_adapter_with_store(&store, "deepseek_harness").unwrap();
    assert_eq!(
        adapter.skills_dir(),
        chosen,
        "the edit must be what resolves"
    );
    assert!(adapter.has_path_override());
}

#[test]
fn a_project_path_edit_survives_the_same_shadowing() {
    let tmp = tempdir().unwrap();
    let store = store_with_colliding_custom_tool(tmp.path(), "deepseek_harness");

    apply_tool_project_skills_dir(&store, "deepseek_harness", Some(".mine/skills")).unwrap();

    let adapter = tool_adapters::find_adapter_with_store(&store, "deepseek_harness").unwrap();
    assert_eq!(adapter.project_relative_skills_dir(), ".mine/skills");
}

/// A genuine custom agent — no built-in claims its key — still keeps both
/// paths on its own definition, which is where its adapter reads them.
#[test]
fn a_real_custom_tool_still_stores_its_paths_on_its_definition() {
    let tmp = tempdir().unwrap();
    let store = store_with_colliding_custom_tool(tmp.path(), "my_own_agent");
    let chosen = tmp.path().join("chosen");

    apply_tool_skills_dir(&store, "my_own_agent", &chosen.to_string_lossy()).unwrap();
    apply_tool_project_skills_dir(&store, "my_own_agent", Some(".mine/skills")).unwrap();

    let customs = get_custom_tools(&store);
    let custom = customs.iter().find(|c| c.key == "my_own_agent").unwrap();
    assert_eq!(std::path::Path::new(&custom.skills_dir), chosen);
    assert_eq!(
        custom.project_relative_skills_dir.as_deref(),
        Some(".mine/skills")
    );

    let adapter = tool_adapters::find_adapter_with_store(&store, "my_own_agent").unwrap();
    assert_eq!(adapter.skills_dir(), chosen);
    assert_eq!(adapter.project_relative_skills_dir(), ".mine/skills");
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

fn write_skill_dir(base: &std::path::Path, dir_name: &str, marker: &str) -> PathBuf {
    let dir = base.join(dir_name);
    fs::create_dir_all(&dir).unwrap();
    fs::write(
        dir.join("SKILL.md"),
        format!("---\nname: {dir_name}\n---\n"),
    )
    .unwrap();
    fs::write(dir.join("unique.txt"), marker).unwrap();
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
    store.set_setting("sync_mode", "copy").unwrap();
}

#[test]
fn active_scenario_tool_sync_keeps_duplicate_skill_names_separate() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
    let source_base = tmp.path().join("central");
    let target_base = tmp.path().join("agent-skills");
    fs::create_dir_all(&source_base).unwrap();
    fs::create_dir_all(&target_base).unwrap();
    configure_single_custom_tool(&store, &target_base);

    store
        .insert_scenario(&sample_scenario("active", "Active"))
        .unwrap();
    store.set_active_scenario("active").unwrap();

    let first_dir = write_skill_dir(&source_base, "skill123", "first");
    let second_dir = write_skill_dir(&source_base, "skill123-2", "second");
    store
        .insert_skill(&sample_skill("first", "skill123", &first_dir))
        .unwrap();
    store
        .insert_skill(&sample_skill("second", "skill123", &second_dir))
        .unwrap();
    store.add_skill_to_scenario("active", "first").unwrap();
    store.add_skill_to_scenario("active", "second").unwrap();

    sync_active_scenario_to_tool(&store, "test_agent");

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

/// Insert a minimal skill row (the `skill_targets` foreign key needs it)
/// plus one target row pointing at `target_path`.
fn insert_skill_and_target(
    store: &SkillStore,
    target_path: &std::path::Path,
    tool: &str,
    mode: &str,
) {
    store
        .insert_skill(&SkillRecord {
            id: "s1".to_string(),
            name: "my-skill".to_string(),
            description: None,
            source_type: "import".to_string(),
            source_ref: None,
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            source_agent: None,
            remote_revision: None,
            central_path: "unused".to_string(),
            content_hash: None,
            enabled: true,
            created_at: 1,
            updated_at: 1,
            status: "ok".to_string(),
            update_status: "local_only".to_string(),
            last_checked_at: None,
            last_check_error: None,
        })
        .unwrap();
    store
        .insert_target(&SkillTargetRecord {
            id: "t1".to_string(),
            skill_id: "s1".to_string(),
            tool: tool.to_string(),
            target_path: target_path.to_string_lossy().to_string(),
            mode: mode.to_string(),
            status: "ok".to_string(),
            synced_at: Some(1),
            last_error: None,
            source_hash: None,
        })
        .unwrap();
}

/// #435: a `skill_targets` row is a statement about the past. When the
/// user replaced our symlink with a real directory of their own,
/// disabling the tool must preserve it — the row only authorizes
/// removing what still looks like what we deployed.
#[test]
fn disabling_a_tool_preserves_user_content_that_replaced_a_recorded_link() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
    let target = tmp.path().join("agent-skills").join("my-skill");
    fs::create_dir_all(&target).unwrap();
    fs::write(target.join("mine.txt"), "DO_NOT_OVERWRITE").unwrap();
    insert_skill_and_target(&store, &target, "test_agent", "symlink");

    unsync_all_for_tool(&store, "test_agent");

    assert_eq!(
        fs::read_to_string(target.join("mine.txt")).unwrap(),
        "DO_NOT_OVERWRITE",
        "the user's directory must survive the disable"
    );
    assert!(
        store.get_targets_for_skill("s1").unwrap().is_empty(),
        "the stale record must not survive the disable"
    );
}

/// A copy-mode row still vouches for a real directory — that is what a
/// copy deployment is — so disabling the tool removes it. Guards #435's
/// fix against overcorrecting into refusing every real directory.
#[test]
fn disabling_a_tool_still_removes_a_recorded_copy_deployment() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
    let target = tmp.path().join("agent-skills").join("my-skill");
    fs::create_dir_all(&target).unwrap();
    fs::write(target.join("SKILL.md"), "---\nname: my-skill\n---\n").unwrap();
    insert_skill_and_target(&store, &target, "test_agent", "copy");

    unsync_all_for_tool(&store, "test_agent");

    assert!(
        !target.exists(),
        "a recorded copy deployment is ours to remove"
    );
    assert!(store.get_targets_for_skill("s1").unwrap().is_empty());
}

/// Two tools resolving to one skills directory share the deployment at a
/// path. Disabling one must leave the other's copy in place.
#[test]
fn disabling_a_tool_keeps_a_deployment_another_tool_shares() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
    let target = tmp.path().join("agent-skills").join("my-skill");
    fs::create_dir_all(&target).unwrap();
    fs::write(target.join("SKILL.md"), "---\nname: my-skill\n---\n").unwrap();
    insert_skill_and_target(&store, &target, "agent_a", "copy");
    store
        .insert_target(&SkillTargetRecord {
            id: "t2".to_string(),
            skill_id: "s1".to_string(),
            tool: "agent_b".to_string(),
            target_path: target.to_string_lossy().to_string(),
            mode: "copy".to_string(),
            status: "ok".to_string(),
            synced_at: Some(1),
            last_error: None,
            source_hash: None,
        })
        .unwrap();

    unsync_all_for_tool(&store, "agent_a");

    assert!(target.exists(), "agent_b still deploys this path");
    let remaining = store.get_targets_for_skill("s1").unwrap();
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].tool, "agent_b");
}
