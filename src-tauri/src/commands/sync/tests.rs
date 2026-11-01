use super::*;
use crate::core::skill_store::SkillRecord;
use crate::core::tool_adapters::CustomToolDef;
use std::fs;
use tempfile::tempdir;

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

/// Two agents resolving to one skills directory, which is what makes a
/// single filesystem object be claimed by several `skill_targets` rows
/// (the table is unique on `(skill_id, tool)`, not on `target_path`).
fn configure_two_custom_tools_sharing_a_dir(store: &SkillStore, shared: &std::path::Path) {
    let custom_tools: Vec<CustomToolDef> = ["agent_a", "agent_b"]
        .into_iter()
        .map(|key| CustomToolDef {
            key: key.to_string(),
            display_name: key.to_string(),
            skills_dir: shared.to_string_lossy().to_string(),
            project_relative_skills_dir: None,
            category: Default::default(),
        })
        .collect();
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

/// Deploying to two agents that share a skills directory must succeed. The
/// second pair has no row of its own when the batch starts, so without
/// batch-level evidence it would refuse the directory the first pair just
/// wrote (#363 review, round 2).
#[test]
fn shared_skills_dir_deploys_to_both_agents_in_one_batch() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
    let source_base = tmp.path().join("central");
    let shared = tmp.path().join("shared-agent-skills");
    fs::create_dir_all(&source_base).unwrap();
    fs::create_dir_all(&shared).unwrap();
    configure_two_custom_tools_sharing_a_dir(&store, &shared);

    let dir = write_skill_dir(&source_base, "shared-skill", "content");
    store
        .insert_skill(&sample_skill("s1", "shared-skill", &dir))
        .unwrap();

    scenario_service::apply_skills_to_tools(
        &store,
        &["s1".to_string()],
        &["agent_a".to_string(), "agent_b".to_string()],
        scenario_service::BatchApplyMode::Add,
        false,
    )
    .expect("a shared target directory must not make the second agent refuse");

    assert_eq!(
        fs::read_to_string(shared.join("shared-skill/unique.txt")).unwrap(),
        "content"
    );
    let rows = store.get_targets_for_skill("s1").unwrap();
    assert_eq!(rows.len(), 2, "both agents should be recorded: {rows:?}");
}

/// Contradictory rows for one path are ambiguous evidence, and a fix whose
/// purpose is preservation must refuse rather than guess. Regression for the
/// hole that survived three review rounds: evidence has to be pooled from
/// every row on the path, including rows this batch did not select.
#[test]
fn contradictory_rows_on_a_shared_path_refuse_to_replace_user_content() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
    let source_base = tmp.path().join("central");
    let shared = tmp.path().join("shared-agent-skills");
    fs::create_dir_all(&source_base).unwrap();
    fs::create_dir_all(&shared).unwrap();
    configure_two_custom_tools_sharing_a_dir(&store, &shared);

    let dir = write_skill_dir(&source_base, "shared-skill", "content");
    store
        .insert_skill(&sample_skill("s1", "shared-skill", &dir))
        .unwrap();

    // A real directory of the user's now sits at the shared target.
    let target = shared.join("shared-skill");
    fs::create_dir_all(&target).unwrap();
    fs::write(target.join("mine.txt"), "DO_NOT_OVERWRITE").unwrap();

    // Two rows disagree about what we put there. Only agent_a is selected
    // below, so the contradicting agent_b row is exactly the "unselected
    // row" that pooling from the batch alone would have missed.
    for (tool, mode) in [("agent_a", "copy"), ("agent_b", "symlink")] {
        store
            .insert_target(&crate::core::skill_store::SkillTargetRecord {
                id: format!("t-{tool}"),
                skill_id: "s1".to_string(),
                tool: tool.to_string(),
                target_path: target.to_string_lossy().to_string(),
                mode: mode.to_string(),
                status: "ok".to_string(),
                synced_at: Some(1),
                last_error: None,
                source_hash: Some("h1".to_string()),
            })
            .unwrap();
    }

    let result = scenario_service::apply_skills_to_tools(
        &store,
        &["s1".to_string()],
        &["agent_a".to_string()],
        scenario_service::BatchApplyMode::Add,
        false,
    );

    assert!(
        result.is_err(),
        "contradictory records must refuse, not guess a mode"
    );
    assert_eq!(
        fs::read_to_string(target.join("mine.txt")).unwrap(),
        "DO_NOT_OVERWRITE"
    );
}

/// #435: unchecking a skill for one tool in the active skill group used to
/// delete whatever sat at the recorded path. A real directory that
/// replaced our symlink is the user's — preserve it and drop only the
/// record.
#[test]
fn skill_group_unsync_preserves_user_content_that_replaced_a_recorded_link() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
    let target = tmp.path().join("agent-skills").join("my-skill");
    fs::create_dir_all(&target).unwrap();
    fs::write(target.join("mine.txt"), "DO_NOT_OVERWRITE").unwrap();
    store
        .insert_skill(&sample_skill("s1", "my-skill", &tmp.path().join("central")))
        .unwrap();
    store
        .insert_target(&crate::core::skill_store::SkillTargetRecord {
            id: "t1".to_string(),
            skill_id: "s1".to_string(),
            tool: "agent_a".to_string(),
            target_path: target.to_string_lossy().to_string(),
            mode: "symlink".to_string(),
            status: "ok".to_string(),
            synced_at: Some(1),
            last_error: None,
            source_hash: None,
        })
        .unwrap();

    unsync_skill_for_tool_in_skill_group(&store, "s1", "agent_a").unwrap();

    assert_eq!(
        fs::read_to_string(target.join("mine.txt")).unwrap(),
        "DO_NOT_OVERWRITE",
        "the user's directory must survive the uncheck"
    );
    assert!(store.get_targets_for_skill("s1").unwrap().is_empty());
}

/// Unchecking one tool must not delete a deployment another tool shares.
#[test]
fn skill_group_unsync_keeps_a_deployment_another_tool_shares() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
    let target = tmp.path().join("agent-skills").join("my-skill");
    fs::create_dir_all(&target).unwrap();
    fs::write(target.join("SKILL.md"), "---\nname: my-skill\n---\n").unwrap();
    store
        .insert_skill(&sample_skill("s1", "my-skill", &tmp.path().join("central")))
        .unwrap();
    for (id, tool) in [("t1", "agent_a"), ("t2", "agent_b")] {
        store
            .insert_target(&crate::core::skill_store::SkillTargetRecord {
                id: id.to_string(),
                skill_id: "s1".to_string(),
                tool: tool.to_string(),
                target_path: target.to_string_lossy().to_string(),
                mode: "copy".to_string(),
                status: "ok".to_string(),
                synced_at: Some(1),
                last_error: None,
                source_hash: None,
            })
            .unwrap();
    }

    unsync_skill_for_tool_in_skill_group(&store, "s1", "agent_a").unwrap();

    assert!(target.exists(), "agent_b still deploys this path");
    let remaining = store.get_targets_for_skill("s1").unwrap();
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].tool, "agent_b");
}

#[test]
fn sync_skill_to_tool_keeps_duplicate_skill_names_separate() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
    let source_base = tmp.path().join("central");
    let target_base = tmp.path().join("agent-skills");
    fs::create_dir_all(&source_base).unwrap();
    fs::create_dir_all(&target_base).unwrap();
    configure_single_custom_tool(&store, &target_base);

    let first_dir = write_skill_dir(&source_base, "skill123", "first");
    let second_dir = write_skill_dir(&source_base, "skill123-2", "second");
    store
        .insert_skill(&sample_skill("first", "skill123", &first_dir))
        .unwrap();
    store
        .insert_skill(&sample_skill("second", "skill123", &second_dir))
        .unwrap();

    sync_skill_to_tool_internal(&store, "first", "test_agent", false).unwrap();
    sync_skill_to_tool_internal(&store, "second", "test_agent", false).unwrap();

    assert_eq!(
        fs::read_to_string(target_base.join("skill123/unique.txt")).unwrap(),
        "first"
    );
    assert_eq!(
        fs::read_to_string(target_base.join("skill123-2/unique.txt")).unwrap(),
        "second"
    );
}
