use super::{
    backfill_stranded_agent_targets, enrich_center_status, import_agent_local_skill_to_center,
    update_agent_local_skill_from_center,
};
use crate::core::content_hash;
use crate::core::project_scanner::ProjectSkillInfo;
use crate::core::skill_store::{ScenarioRecord, SkillRecord, SkillStore};
use crate::core::{
    central_repo, installer, scenario_service, sync_engine, tool_adapters, tool_service,
};
use std::collections::HashMap;

// Backfill must only inspect fixture tools, never the developer's real skills.
fn disable_host_tools(store: &SkillStore) {
    let keys: Vec<_> = tool_adapters::default_tool_adapters()
        .into_iter()
        .map(|tool| tool.key)
        .collect();
    store
        .set_setting("disabled_tools", &serde_json::to_string(&keys).unwrap())
        .unwrap();
}

#[test]
fn importing_nested_hermes_skill_preserves_same_named_category() {
    let _guard = central_repo::test_base_dir_lock();
    let temp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(temp.path().join("center")));
    let store = SkillStore::new(&temp.path().join("store.db")).unwrap();

    let skills_root = temp.path().join("hermes-skills");
    let nested_skill = skills_root.join("software-development").join("github");
    let other_skill = skills_root.join("github").join("github-auth");
    std::fs::create_dir_all(&nested_skill).unwrap();
    std::fs::create_dir_all(&other_skill).unwrap();
    std::fs::write(nested_skill.join("SKILL.md"), "# github\n").unwrap();
    std::fs::write(other_skill.join("SKILL.md"), "# github-auth\n").unwrap();
    std::fs::write(other_skill.join("mine.txt"), "keep this category").unwrap();
    store
        .set_setting(
            "custom_tool_paths",
            &serde_json::json!({ "hermes": skills_root.to_string_lossy() }).to_string(),
        )
        .unwrap();

    import_agent_local_skill_to_center(&store, "hermes", "software-development/github").unwrap();

    assert_eq!(
        std::fs::read_to_string(other_skill.join("mine.txt")).unwrap(),
        "keep this category"
    );
    let targets = store.get_all_targets().unwrap();
    assert_eq!(targets.len(), 1);
    assert_eq!(targets[0].target_path, nested_skill.to_string_lossy());
    assert!(nested_skill.join("SKILL.md").exists());

    let skill_id = targets[0].skill_id.clone();
    scenario_service::sync_single_skill_to_tool(
        &store,
        &skill_id,
        "hermes",
        scenario_service::DeployIntent::Managed,
        false,
    )
    .unwrap();
    scenario_service::apply_skills_to_tools(
        &store,
        std::slice::from_ref(&skill_id),
        &["hermes".to_string()],
        scenario_service::BatchApplyMode::Add,
        false,
    )
    .unwrap();
    let now = chrono::Utc::now().timestamp_millis();
    store
        .insert_scenario(&ScenarioRecord {
            id: "active".to_string(),
            name: "Active".to_string(),
            description: None,
            icon: None,
            sort_order: 0,
            created_at: now,
            updated_at: now,
        })
        .unwrap();
    store.add_skill_to_scenario("active", &skill_id).unwrap();
    for adapter in tool_adapters::enabled_deployable_adapters(&store) {
        if adapter.key != "hermes" {
            store
                .set_scenario_skill_tool_enabled("active", &skill_id, &adapter.key, false)
                .unwrap();
        }
    }
    store.set_active_scenario("active").unwrap();
    let desired = scenario_service::collect_scenario_sync_targets(&store, "active").unwrap();
    assert_eq!(desired.len(), 1);
    assert_eq!(desired[0].target, nested_skill);
    scenario_service::sync_skill_to_active_scenario(&store, "active", &skill_id).unwrap();
    assert!(!skills_root.join("github").join("SKILL.md").exists());
    assert_eq!(
        std::fs::read_to_string(other_skill.join("mine.txt")).unwrap(),
        "keep this category"
    );
    assert_eq!(
        store.get_all_targets().unwrap()[0].target_path,
        nested_skill.to_string_lossy()
    );

    central_repo::set_test_base_dir_override(None);
}

#[test]
fn importing_agent_local_skill_attaches_target_but_not_scenario() {
    let _guard = central_repo::test_base_dir_lock();
    let temp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(temp.path().join("center")));

    let db_path = temp.path().join("store.db");
    let store = SkillStore::new(&db_path).unwrap();
    disable_host_tools(&store);

    let skills_root = temp.path().join("agent-skills");
    let skill_dir = skills_root.join("local-tool");
    std::fs::create_dir_all(&skill_dir).unwrap();
    std::fs::write(
        skill_dir.join("SKILL.md"),
        "---\nname: local-tool\ndescription: Local test skill\n---\n",
    )
    .unwrap();

    store
        .set_setting(
            "custom_tools",
            &serde_json::json!([
                {
                    "key": "test_agent",
                    "display_name": "Test Agent",
                    "skills_dir": skills_root.to_string_lossy(),
                    "project_relative_skills_dir": ".test-agent/skills"
                }
            ])
            .to_string(),
        )
        .unwrap();

    let now = chrono::Utc::now().timestamp_millis();
    store
        .insert_scenario(&ScenarioRecord {
            id: "active".to_string(),
            name: "Active".to_string(),
            description: None,
            icon: None,
            sort_order: 0,
            created_at: now,
            updated_at: now,
        })
        .unwrap();
    store.set_active_scenario("active").unwrap();

    import_agent_local_skill_to_center(&store, "test_agent", "local-tool").unwrap();

    let skills = store.get_all_skills().unwrap();
    assert_eq!(skills.len(), 1);
    // Importing must NOT silently enroll the skill into the active scenario.
    assert!(store
        .get_scenarios_for_skill(&skills[0].id)
        .unwrap()
        .is_empty());
    // But it MUST register a managed sync target for the importing agent,
    // pointed at the skill's actual on-disk location, so the workspace
    // recognizes it as managed and shows its delete button.
    let targets = store.get_all_targets().unwrap();
    assert_eq!(targets.len(), 1);
    assert_eq!(targets[0].skill_id, skills[0].id);
    assert_eq!(targets[0].tool, "test_agent");
    assert_eq!(targets[0].target_path, skill_dir.to_string_lossy());

    // The on-disk artifact must be a sync_engine-owned symlink resolving to
    // the central copy — NOT the user's original real directory. This is
    // the property that makes a later unsync safe: removing the target only
    // drops the managed link, leaving the central skill intact.
    let meta = std::fs::symlink_metadata(&skill_dir).unwrap();
    assert!(meta.file_type().is_symlink());
    assert_eq!(
        std::fs::canonicalize(&skill_dir).unwrap(),
        std::fs::canonicalize(&skills[0].central_path).unwrap()
    );

    central_repo::set_test_base_dir_override(None);
}

#[test]
fn enriching_agent_local_skills_copies_center_tags() {
    let skill = ProjectSkillInfo {
        name: "local-tool".to_string(),
        dir_name: "local-tool".to_string(),
        relative_path: "local-tool".to_string(),
        description: Some("Agent copy".to_string()),
        path: "/tmp/agent-skills/local-tool".to_string(),
        files: vec![],
        enabled: true,
        agent: "test_agent".to_string(),
        agent_display_name: "Test Agent".to_string(),
        tags: Vec::new(),
        in_center: false,
        sync_status: "project_only".to_string(),
        center_skill_id: None,
        last_modified_at: None,
        content_hash: Some("same-hash".to_string()),
    };

    let managed = SkillRecord {
        id: "center-id".to_string(),
        name: "local-tool".to_string(),
        description: Some("Center copy".to_string()),
        source_type: "local".to_string(),
        source_ref: None,
        source_ref_resolved: None,
        source_subpath: None,
        source_branch: None,
        source_revision: None,
        source_agent: None,
        remote_revision: None,
        central_path: "/tmp/center/local-tool".to_string(),
        content_hash: Some("same-hash".to_string()),
        enabled: true,
        created_at: 0,
        updated_at: 0,
        status: "ok".to_string(),
        update_status: "local_only".to_string(),
        last_checked_at: Some(0),
        last_check_error: None,
    };

    let mut tags_map = HashMap::new();
    tags_map.insert(
        "center-id".to_string(),
        vec!["create".to_string(), "manage".to_string()],
    );

    let enriched = enrich_center_status(vec![skill], &[managed], &[], &tags_map);
    assert_eq!(enriched[0].center_skill_id.as_deref(), Some("center-id"));
    assert_eq!(
        enriched[0].tags,
        vec!["create".to_string(), "manage".to_string()]
    );
}

#[test]
fn importing_agent_local_skill_does_not_overwrite_name_only_center_match() {
    let _guard = central_repo::test_base_dir_lock();
    let temp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(temp.path().join("center")));

    let db_path = temp.path().join("store.db");
    let store = SkillStore::new(&db_path).unwrap();
    disable_host_tools(&store);

    let center_source = temp.path().join("center-source");
    std::fs::create_dir_all(&center_source).unwrap();
    std::fs::write(
        center_source.join("SKILL.md"),
        "---\nname: local-tool\ndescription: Center copy\n---\ncenter\n",
    )
    .unwrap();
    let existing = installer::install_from_local(&center_source, Some("local-tool")).unwrap();
    let now = chrono::Utc::now().timestamp_millis();
    store
        .insert_skill(&SkillRecord {
            id: "existing-center".to_string(),
            name: "local-tool".to_string(),
            description: existing.description.clone(),
            source_type: "local".to_string(),
            source_ref: Some(center_source.to_string_lossy().to_string()),
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            source_agent: None,
            remote_revision: None,
            central_path: existing.central_path.to_string_lossy().to_string(),
            content_hash: Some(existing.content_hash.clone()),
            enabled: true,
            created_at: now,
            updated_at: now,
            status: "ok".to_string(),
            update_status: "local_only".to_string(),
            last_checked_at: Some(now),
            last_check_error: None,
        })
        .unwrap();

    let skills_root = temp.path().join("agent-skills");
    let skill_dir = skills_root.join("local-tool");
    std::fs::create_dir_all(&skill_dir).unwrap();
    std::fs::write(
        skill_dir.join("SKILL.md"),
        "---\nname: local-tool\ndescription: Agent copy\n---\nagent\n",
    )
    .unwrap();

    store
        .set_setting(
            "custom_tools",
            &serde_json::json!([
                {
                    "key": "test_agent",
                    "display_name": "Test Agent",
                    "skills_dir": skills_root.to_string_lossy(),
                    "project_relative_skills_dir": ".test-agent/skills"
                }
            ])
            .to_string(),
        )
        .unwrap();

    import_agent_local_skill_to_center(&store, "test_agent", "local-tool").unwrap();

    let skills = store.get_all_skills().unwrap();
    assert_eq!(skills.len(), 2);
    let original_content =
        std::fs::read_to_string(std::path::Path::new(&existing.central_path).join("SKILL.md"))
            .unwrap();
    assert!(original_content.contains("Center copy"));
    assert!(skills.iter().any(|skill| skill.name == "local-tool-2"));

    central_repo::set_test_base_dir_override(None);
}

#[test]
fn importing_verified_center_match_reuses_skill_and_attaches_target() {
    let _guard = central_repo::test_base_dir_lock();
    let temp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(temp.path().join("center")));

    let db_path = temp.path().join("store.db");
    let store = SkillStore::new(&db_path).unwrap();
    disable_host_tools(&store);

    let skills_root = temp.path().join("agent-skills");
    let skill_dir = skills_root.join("local-tool");
    std::fs::create_dir_all(&skill_dir).unwrap();
    std::fs::write(
        skill_dir.join("SKILL.md"),
        "---\nname: local-tool\ndescription: Agent copy\n---\nlocal\n",
    )
    .unwrap();

    // Pre-existing center skill whose source_ref points at the local skill,
    // so the import resolves to a *verified* match (the existing-match
    // branch) rather than creating a duplicate.
    let existing = installer::install_from_local(&skill_dir, Some("local-tool")).unwrap();
    let now = chrono::Utc::now().timestamp_millis();
    store
        .insert_skill(&SkillRecord {
            id: "existing-center".to_string(),
            name: "local-tool".to_string(),
            description: existing.description.clone(),
            source_type: "local".to_string(),
            source_ref: Some(skill_dir.to_string_lossy().to_string()),
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            source_agent: None,
            remote_revision: None,
            central_path: existing.central_path.to_string_lossy().to_string(),
            content_hash: Some(existing.content_hash.clone()),
            enabled: true,
            created_at: now,
            updated_at: now,
            status: "ok".to_string(),
            update_status: "local_only".to_string(),
            last_checked_at: Some(now),
            last_check_error: None,
        })
        .unwrap();

    store
        .set_setting(
            "custom_tools",
            &serde_json::json!([
                {
                    "key": "test_agent",
                    "display_name": "Test Agent",
                    "skills_dir": skills_root.to_string_lossy(),
                    "project_relative_skills_dir": ".test-agent/skills"
                }
            ])
            .to_string(),
        )
        .unwrap();

    import_agent_local_skill_to_center(&store, "test_agent", "local-tool").unwrap();

    // The existing center skill is reused, not duplicated.
    let skills = store.get_all_skills().unwrap();
    assert_eq!(skills.len(), 1);
    assert_eq!(skills[0].id, "existing-center");

    // And a managed target is attached for the importing agent at the
    // skill's actual on-disk path.
    let targets = store.get_all_targets().unwrap();
    assert_eq!(targets.len(), 1);
    assert_eq!(targets[0].skill_id, "existing-center");
    assert_eq!(targets[0].tool, "test_agent");
    assert_eq!(targets[0].target_path, skill_dir.to_string_lossy());

    central_repo::set_test_base_dir_override(None);
}

#[test]
fn backfill_registers_target_for_stranded_in_sync_skill() {
    let _guard = central_repo::test_base_dir_lock();
    let temp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(temp.path().join("center")));

    let db_path = temp.path().join("store.db");
    let store = SkillStore::new(&db_path).unwrap();
    disable_host_tools(&store);

    let skills_root = temp.path().join("agent-skills");
    let skill_dir = skills_root.join("local-tool");
    std::fs::create_dir_all(&skill_dir).unwrap();
    std::fs::write(
        skill_dir.join("SKILL.md"),
        "---\nname: local-tool\ndescription: Agent copy\n---\nlocal\n",
    )
    .unwrap();

    // A center skill that was uploaded before targets were registered:
    // source_ref points at the agent dir, content matches, but NO target.
    let existing = installer::install_from_local(&skill_dir, Some("local-tool")).unwrap();
    let now = chrono::Utc::now().timestamp_millis();
    store
        .insert_skill(&SkillRecord {
            id: "stranded".to_string(),
            name: "local-tool".to_string(),
            description: existing.description.clone(),
            source_type: "local".to_string(),
            source_ref: Some(skill_dir.to_string_lossy().to_string()),
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            source_agent: None,
            remote_revision: None,
            central_path: existing.central_path.to_string_lossy().to_string(),
            content_hash: Some(existing.content_hash.clone()),
            enabled: true,
            created_at: now,
            updated_at: now,
            status: "ok".to_string(),
            update_status: "local_only".to_string(),
            last_checked_at: Some(now),
            last_check_error: None,
        })
        .unwrap();

    store
        .set_setting(
            "custom_tools",
            &serde_json::json!([
                {
                    "key": "test_agent",
                    "display_name": "Test Agent",
                    "skills_dir": skills_root.to_string_lossy(),
                    "project_relative_skills_dir": ".test-agent/skills"
                }
            ])
            .to_string(),
        )
        .unwrap();

    // Stranded precondition: no targets at all.
    assert!(store.get_all_targets().unwrap().is_empty());

    let repaired = backfill_stranded_agent_targets(&store);
    assert_eq!(repaired, 1);

    let targets = store.get_all_targets().unwrap();
    assert_eq!(targets.len(), 1);
    assert_eq!(targets[0].skill_id, "stranded");
    assert_eq!(targets[0].tool, "test_agent");
    assert_eq!(targets[0].target_path, skill_dir.to_string_lossy());

    // Idempotent: a second run sees the target and repairs nothing.
    assert_eq!(backfill_stranded_agent_targets(&store), 0);
    assert_eq!(store.get_all_targets().unwrap().len(), 1);

    // After a full repair the gate is cleared (empty), not left pointing at
    // a stale set, so a future stranded skill is never masked.
    assert_eq!(
        store
            .get_setting(super::BACKFILL_SIG_KEY)
            .unwrap()
            .as_deref(),
        Some("")
    );

    central_repo::set_test_base_dir_override(None);
}

#[test]
fn backfill_repoints_source_ref_when_adopting_the_import_source_dir() {
    let _guard = central_repo::test_base_dir_lock();
    let temp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(temp.path().join("center")));

    let db_path = temp.path().join("store.db");
    let store = SkillStore::new(&db_path).unwrap();
    disable_host_tools(&store);

    let skills_root = temp.path().join("agent-skills");
    let skill_dir = skills_root.join("imported-tool");
    std::fs::create_dir_all(&skill_dir).unwrap();
    std::fs::write(
        skill_dir.join("SKILL.md"),
        "---\nname: imported-tool\ndescription: Agent copy\n---\nlocal\n",
    )
    .unwrap();

    // The #425 shape: an *imported* skill whose source_ref names the agent
    // directory it was imported from. The importer records no target row,
    // so the backfill below is about to adopt that very directory as a
    // deployment.
    let existing = installer::install_from_local(&skill_dir, Some("imported-tool")).unwrap();
    let now = chrono::Utc::now().timestamp_millis();
    store
        .insert_skill(&SkillRecord {
            id: "imported".to_string(),
            name: "imported-tool".to_string(),
            description: existing.description.clone(),
            source_type: "import".to_string(),
            source_ref: Some(skill_dir.to_string_lossy().to_string()),
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            source_agent: None,
            remote_revision: None,
            central_path: existing.central_path.to_string_lossy().to_string(),
            content_hash: Some(existing.content_hash.clone()),
            enabled: true,
            created_at: now,
            updated_at: now,
            status: "ok".to_string(),
            update_status: "local_only".to_string(),
            last_checked_at: Some(now),
            last_check_error: None,
        })
        .unwrap();

    store
        .set_setting(
            "custom_tools",
            &serde_json::json!([
                {
                    "key": "test_agent",
                    "display_name": "Test Agent",
                    "skills_dir": skills_root.to_string_lossy(),
                    "project_relative_skills_dir": ".test-agent/skills"
                }
            ])
            .to_string(),
        )
        .unwrap();

    // Stranded precondition: no targets at all.
    assert!(store.get_all_targets().unwrap().is_empty());

    let repaired = backfill_stranded_agent_targets(&store);
    assert_eq!(repaired, 1);

    // The adoption must have re-pointed source_ref at the central copy
    // before replacing the directory: the agent dir is now a deployment,
    // and a deployment can be removed at any time.
    let skill = store.get_skill_by_id("imported").unwrap().unwrap();
    assert_eq!(
        skill.source_ref.as_deref(),
        Some(existing.central_path.to_string_lossy().to_string().as_str())
    );

    // Simulate the agent cleaning up a deployment it does not recognize
    // (what WorkBuddy did in #425): the source_ref must keep resolving, so
    // the update check reports `up_to_date` instead of `source_missing`.
    sync_engine::remove_target(&skill_dir).unwrap();
    assert!(std::path::Path::new(skill.source_ref.as_deref().unwrap()).exists());

    central_repo::set_test_base_dir_override(None);
}

#[test]
fn importing_an_agent_local_skill_leaves_source_ref_pointing_at_central() {
    let _guard = central_repo::test_base_dir_lock();
    let temp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(temp.path().join("center")));

    let db_path = temp.path().join("store.db");
    let store = SkillStore::new(&db_path).unwrap();
    disable_host_tools(&store);

    let skills_root = temp.path().join("agent-skills");
    let skill_dir = skills_root.join("local-tool");
    std::fs::create_dir_all(&skill_dir).unwrap();
    std::fs::write(
        skill_dir.join("SKILL.md"),
        "---\nname: local-tool\ndescription: Local test skill\n---\n",
    )
    .unwrap();

    store
        .set_setting(
            "custom_tools",
            &serde_json::json!([
                {
                    "key": "test_agent",
                    "display_name": "Test Agent",
                    "skills_dir": skills_root.to_string_lossy(),
                    "project_relative_skills_dir": ".test-agent/skills"
                }
            ])
            .to_string(),
        )
        .unwrap();

    import_agent_local_skill_to_center(&store, "test_agent", "local-tool").unwrap();

    let skills = store.get_all_skills().unwrap();
    assert_eq!(skills.len(), 1);
    // Importing adopts the agent directory as a managed deployment, so the
    // recorded source must be the central copy — not the agent path that
    // just became a removable link (#425).
    assert_eq!(
        skills[0].source_ref.as_deref(),
        Some(skills[0].central_path.as_str())
    );

    // Removing that deployment later (agent cleanup, or an undeploy) must
    // not dangle the source.
    sync_engine::remove_target(&skill_dir).unwrap();
    assert!(std::path::Path::new(skills[0].source_ref.as_deref().unwrap()).exists());

    central_repo::set_test_base_dir_override(None);
}

#[test]
fn stranded_signature_reflects_set_not_row_order() {
    let skill = |id: &str, source_ref: Option<&str>| SkillRecord {
        id: id.to_string(),
        name: id.to_string(),
        description: None,
        source_type: "local".to_string(),
        source_ref: source_ref.map(str::to_string),
        source_ref_resolved: None,
        source_subpath: None,
        source_branch: None,
        source_revision: None,
        source_agent: None,
        remote_revision: None,
        central_path: String::new(),
        content_hash: None,
        enabled: true,
        created_at: 0,
        updated_at: 0,
        status: "ok".to_string(),
        update_status: "local_only".to_string(),
        last_checked_at: None,
        last_check_error: None,
    };

    // No source_ref, or already targeted → not stranded → no signature.
    assert_eq!(
        super::stranded_candidate_signature(&[skill("a", None)], &[], &[]),
        None
    );

    let a = skill("a", Some("/x"));
    let b = skill("b", Some("/y"));
    let sig_ab = super::stranded_candidate_signature(&[a.clone(), b.clone()], &[], &[]);
    let sig_ba = super::stranded_candidate_signature(&[b, a], &[], &[]);
    assert!(sig_ab.is_some());
    // Order-independent: same set → same signature.
    assert_eq!(sig_ab, sig_ba);
    // Different set → different signature.
    assert_ne!(
        sig_ab,
        super::stranded_candidate_signature(&[skill("a", Some("/x"))], &[], &[])
    );
    // Same skill id but a changed source path must re-arm the backfill scan;
    // otherwise a repaired/imported path change could remain hidden behind
    // an old startup gate.
    assert_ne!(
        super::stranded_candidate_signature(&[skill("a", Some("/x"))], &[], &[]),
        super::stranded_candidate_signature(&[skill("a", Some("/new-x"))], &[], &[])
    );
    // A tool becoming available (installed/enabled) must re-arm the scan:
    // the unchanged candidate might be repairable on the new tool.
    assert_ne!(
        super::stranded_candidate_signature(&[skill("a", Some("/x"))], &[], &[]),
        super::stranded_candidate_signature(
            &[skill("a", Some("/x"))],
            &[],
            &["claude".to_string()]
        )
    );
    // ...but the adapter ORDER must not matter.
    assert_eq!(
        super::stranded_candidate_signature(
            &[skill("a", Some("/x"))],
            &[],
            &["claude".to_string(), "codex".to_string()]
        ),
        super::stranded_candidate_signature(
            &[skill("a", Some("/x"))],
            &[],
            &["codex".to_string(), "claude".to_string()]
        )
    );
}

#[test]
fn backfill_skips_scan_when_candidate_signature_unchanged() {
    let _guard = central_repo::test_base_dir_lock();
    let temp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(temp.path().join("center")));

    let db_path = temp.path().join("store.db");
    let store = SkillStore::new(&db_path).unwrap();
    disable_host_tools(&store);

    let skills_root = temp.path().join("agent-skills");
    let skill_dir = skills_root.join("local-tool");
    std::fs::create_dir_all(&skill_dir).unwrap();
    std::fs::write(
        skill_dir.join("SKILL.md"),
        "---\nname: local-tool\ndescription: Agent copy\n---\nlocal\n",
    )
    .unwrap();

    let existing = installer::install_from_local(&skill_dir, Some("local-tool")).unwrap();
    let now = chrono::Utc::now().timestamp_millis();
    store
        .insert_skill(&SkillRecord {
            id: "stranded".to_string(),
            name: "local-tool".to_string(),
            description: existing.description.clone(),
            source_type: "local".to_string(),
            source_ref: Some(skill_dir.to_string_lossy().to_string()),
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            source_agent: None,
            remote_revision: None,
            central_path: existing.central_path.to_string_lossy().to_string(),
            content_hash: Some(existing.content_hash.clone()),
            enabled: true,
            created_at: now,
            updated_at: now,
            status: "ok".to_string(),
            update_status: "local_only".to_string(),
            last_checked_at: Some(now),
            last_check_error: None,
        })
        .unwrap();

    store
        .set_setting(
            "custom_tools",
            &serde_json::json!([
                {
                    "key": "test_agent",
                    "display_name": "Test Agent",
                    "skills_dir": skills_root.to_string_lossy(),
                    "project_relative_skills_dir": ".test-agent/skills"
                }
            ])
            .to_string(),
        )
        .unwrap();

    // Pre-seed the gate with the CURRENT stranded set's signature, as if a
    // previous launch already attempted (and could not finish repairing) it.
    // Computed exactly the way backfill computes it (same adapter set).
    let disabled = tool_service::get_disabled_tools(&store);
    let available: Vec<String> = tool_adapters::all_tool_adapters(&store)
        .iter()
        .filter(|a| a.can_deploy() && !disabled.contains(&a.key))
        .map(|a| a.key.clone())
        .collect();
    let sig = super::stranded_candidate_signature(
        &store.get_all_skills().unwrap(),
        &store.get_all_targets().unwrap(),
        &available,
    )
    .unwrap();
    store.set_setting(super::BACKFILL_SIG_KEY, &sig).unwrap();

    // The skill IS repairable, but the matching gate short-circuits the
    // expensive filesystem scan (#248): nothing is scanned or repaired.
    assert_eq!(backfill_stranded_agent_targets(&store), 0);
    assert!(store.get_all_targets().unwrap().is_empty());

    // Divergence changes the candidate's content fingerprint → the gate
    // re-arms → the scan runs but correctly refuses to repair a diverged
    // local (that could clobber newer local edits); the attempt re-seeds
    // the gate with the diverged state.
    let skill_md = skill_dir.join("SKILL.md");
    let original = std::fs::read(&skill_md).unwrap();
    std::fs::write(
        &skill_md,
        "---\nname: local-tool\ndescription: Agent copy\n---\nedited locally\n",
    )
    .unwrap();
    assert_eq!(backfill_stranded_agent_targets(&store), 0);
    assert!(store.get_all_targets().unwrap().is_empty());

    // Restoring the local copy to match center must re-arm once more and
    // now complete the repair — "candidate set unchanged" is not
    // "repairability unchanged".
    std::fs::write(&skill_md, original).unwrap();
    assert_eq!(backfill_stranded_agent_targets(&store), 1);
    assert_eq!(store.get_all_targets().unwrap().len(), 1);

    central_repo::set_test_base_dir_override(None);
}

#[test]
fn backfill_rearms_when_adapter_becomes_available() {
    let _guard = central_repo::test_base_dir_lock();
    let temp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(temp.path().join("center")));

    let db_path = temp.path().join("store.db");
    let store = SkillStore::new(&db_path).unwrap();
    disable_host_tools(&store);

    let skills_root = temp.path().join("agent-skills");
    let skill_dir = skills_root.join("local-tool");
    std::fs::create_dir_all(&skill_dir).unwrap();
    std::fs::write(
        skill_dir.join("SKILL.md"),
        "---\nname: local-tool\ndescription: Agent copy\n---\nlocal\n",
    )
    .unwrap();

    let existing = installer::install_from_local(&skill_dir, Some("local-tool")).unwrap();
    let now = chrono::Utc::now().timestamp_millis();
    store
        .insert_skill(&SkillRecord {
            id: "stranded".to_string(),
            name: "local-tool".to_string(),
            description: existing.description.clone(),
            source_type: "local".to_string(),
            source_ref: Some(skill_dir.to_string_lossy().to_string()),
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            source_agent: None,
            remote_revision: None,
            central_path: existing.central_path.to_string_lossy().to_string(),
            content_hash: Some(existing.content_hash.clone()),
            enabled: true,
            created_at: now,
            updated_at: now,
            status: "ok".to_string(),
            update_status: "local_only".to_string(),
            last_checked_at: Some(now),
            last_check_error: None,
        })
        .unwrap();

    // Seed the gate exactly as the previous launch's backfill would have,
    // BEFORE the matching agent is configured (its key absent from the
    // available set).
    let disabled = tool_service::get_disabled_tools(&store);
    let available: Vec<String> = tool_adapters::all_tool_adapters(&store)
        .iter()
        .filter(|a| a.can_deploy() && !disabled.contains(&a.key))
        .map(|a| a.key.clone())
        .collect();
    let sig = super::stranded_candidate_signature(
        &store.get_all_skills().unwrap(),
        &store.get_all_targets().unwrap(),
        &available,
    )
    .unwrap();
    store.set_setting(super::BACKFILL_SIG_KEY, &sig).unwrap();

    // Now the agent appears (installed + enabled): the availability change
    // alone must invalidate the gate and let the repair run.
    store
        .set_setting(
            "custom_tools",
            &serde_json::json!([
                {
                    "key": "test_agent",
                    "display_name": "Test Agent",
                    "skills_dir": skills_root.to_string_lossy(),
                    "project_relative_skills_dir": ".test-agent/skills"
                }
            ])
            .to_string(),
        )
        .unwrap();

    assert_eq!(backfill_stranded_agent_targets(&store), 1);
    assert_eq!(store.get_all_targets().unwrap().len(), 1);

    central_repo::set_test_base_dir_override(None);
}

#[test]
fn pulling_from_center_rejects_newer_local_skill() {
    let _guard = central_repo::test_base_dir_lock();
    let temp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(temp.path().join("center")));

    let db_path = temp.path().join("store.db");
    let store = SkillStore::new(&db_path).unwrap();
    disable_host_tools(&store);

    let center_source = temp.path().join("center-source");
    std::fs::create_dir_all(&center_source).unwrap();
    std::fs::write(
        center_source.join("SKILL.md"),
        "---\nname: local-tool\ndescription: Center copy\n---\ncenter\n",
    )
    .unwrap();
    let existing = installer::install_from_local(&center_source, Some("local-tool")).unwrap();

    let skills_root = temp.path().join("agent-skills");
    let skill_dir = skills_root.join("local-tool");
    std::fs::create_dir_all(&skill_dir).unwrap();
    std::fs::write(
        skill_dir.join("SKILL.md"),
        "---\nname: local-tool\ndescription: Agent copy\n---\nagent newer\n",
    )
    .unwrap();
    // "Newer" has to be true on disk. Both copies are written in the same
    // instant here, and the guard compares real mtimes on both sides — a
    // stale `updated_at` on the center row no longer stands in for age.
    let local_file = std::fs::File::options()
        .write(true)
        .open(skill_dir.join("SKILL.md"))
        .unwrap();
    let newer = std::time::SystemTime::now() + std::time::Duration::from_secs(60);
    local_file
        .set_times(std::fs::FileTimes::new().set_modified(newer))
        .unwrap();

    store
        .set_setting(
            "custom_tools",
            &serde_json::json!([
                {
                    "key": "test_agent",
                    "display_name": "Test Agent",
                    "skills_dir": skills_root.to_string_lossy(),
                    "project_relative_skills_dir": ".test-agent/skills"
                }
            ])
            .to_string(),
        )
        .unwrap();

    store
        .insert_skill(&SkillRecord {
            id: "existing-center".to_string(),
            name: "local-tool".to_string(),
            description: existing.description.clone(),
            source_type: "local".to_string(),
            source_ref: Some(skill_dir.to_string_lossy().to_string()),
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            source_agent: None,
            remote_revision: None,
            central_path: existing.central_path.to_string_lossy().to_string(),
            content_hash: Some(content_hash::hash_directory(&existing.central_path).unwrap()),
            enabled: true,
            created_at: 0,
            updated_at: 0,
            status: "ok".to_string(),
            update_status: "local_only".to_string(),
            last_checked_at: Some(0),
            last_check_error: None,
        })
        .unwrap();

    let result = update_agent_local_skill_from_center(&store, "test_agent", "local-tool");
    assert!(result.is_err());
    let local_content = std::fs::read_to_string(skill_dir.join("SKILL.md")).unwrap();
    assert!(local_content.contains("agent newer"));

    central_repo::set_test_base_dir_override(None);
}
