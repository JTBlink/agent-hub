use super::*;
use crate::core::sync_metadata::ScenarioSkillMetaFile;
use std::collections::BTreeMap;
use tempfile::tempdir;

fn sample_skill(id: &str) -> SkillRecord {
    SkillRecord {
        id: id.to_string(),
        name: id.to_string(),
        description: None,
        source_type: "import".to_string(),
        source_ref: None,
        source_ref_resolved: None,
        source_subpath: None,
        source_branch: None,
        source_revision: None,
        source_agent: None,
        remote_revision: None,
        central_path: format!("/tmp/{id}"),
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

fn membership(scenario_id: &str, skill_id: &str) -> ScenarioSkillMetaFile {
    let mut tools = BTreeMap::new();
    tools.insert("ToolA".to_string(), true);
    ScenarioSkillMetaFile {
        schema_version: 1,
        scenario_id: scenario_id.to_string(),
        skill_id: skill_id.to_string(),
        sort_order: 0,
        tools,
    }
}

#[test]
fn skips_memberships_referencing_missing_skill_or_scenario() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();

    store
        .insert_scenario(&ScenarioRecord {
            id: "s1".to_string(),
            name: "S1".to_string(),
            description: None,
            icon: None,
            sort_order: 0,
            created_at: 1,
            updated_at: 1,
        })
        .unwrap();
    store.upsert_skill(&sample_skill("k1")).unwrap();

    let memberships = vec![
        membership("s1", "k1"),      // valid
        membership("s1", "ghost"),   // skill missing
        membership("ghost-s", "k1"), // scenario missing
    ];

    // Must not panic with a FOREIGN KEY constraint failure.
    store
        .replace_scenario_memberships_from_metadata(&memberships)
        .unwrap();

    assert_eq!(store.get_skill_ids_for_scenario("s1").unwrap(), vec!["k1"]);
    assert_eq!(
        store
            .get_enabled_tools_for_scenario_skill("s1", "k1")
            .unwrap(),
        vec!["ToolA"]
    );
    assert!(store
        .get_enabled_tools_for_scenario_skill("ghost-s", "k1")
        .unwrap()
        .is_empty());
}
