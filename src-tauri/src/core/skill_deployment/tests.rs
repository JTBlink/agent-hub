use super::*;
use crate::core::{error::ErrorKind, skill_store::SkillRecord};
use std::fs;
use tempfile::tempdir;

#[test]
fn ordinary_deployment_preserves_foreign_skill_and_force_repairs_source_reference() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
    let source = tmp.path().join("library/demo");
    let root = tmp.path().join("agent-skills");
    let target = root.join("demo");
    fs::create_dir_all(&source).unwrap();
    fs::create_dir_all(&target).unwrap();
    fs::write(source.join("SKILL.md"), "Library content").unwrap();
    fs::write(target.join("SKILL.md"), "Existing content").unwrap();
    store.set_setting("sync_mode", "copy").unwrap();
    store
        .set_setting(
            "custom_tools",
            &serde_json::json!([{
                "key": "test_agent",
                "display_name": "Test Agent",
                "skills_dir": root.to_string_lossy(),
            }])
            .to_string(),
        )
        .unwrap();
    let skill = SkillRecord {
        id: "demo".into(),
        name: "demo".into(),
        description: None,
        source_type: "local".into(),
        source_ref: Some(target.to_string_lossy().into_owned()),
        source_ref_resolved: None,
        source_subpath: None,
        source_branch: None,
        source_revision: None,
        source_agent: None,
        remote_revision: None,
        central_path: source.to_string_lossy().into_owned(),
        content_hash: None,
        enabled: true,
        created_at: 1,
        updated_at: 1,
        status: "ok".into(),
        update_status: "local_only".into(),
        last_checked_at: None,
        last_check_error: None,
    };
    store.insert_skill(&skill).unwrap();

    let error =
        sync_single_skill_to_tool(&store, "demo", "test_agent", DeployIntent::Managed, false)
            .unwrap_err();
    assert_eq!(error.kind, ErrorKind::TargetConflict);
    let conflicts = error.details.unwrap().conflicts;
    assert_eq!(conflicts.len(), 1);
    assert_eq!(Path::new(&conflicts[0].path), target);
    assert!(conflicts[0].is_skill);
    assert_eq!(
        fs::read_to_string(target.join("SKILL.md")).unwrap(),
        "Existing content"
    );
    assert!(store.get_targets_for_skill("demo").unwrap().is_empty());
    assert_eq!(
        store.get_skill_by_id("demo").unwrap().unwrap().source_ref,
        skill.source_ref
    );

    sync_single_skill_to_tool(&store, "demo", "test_agent", DeployIntent::Managed, true).unwrap();
    assert_eq!(
        fs::read_to_string(target.join("SKILL.md")).unwrap(),
        "Library content"
    );
    assert_eq!(store.get_targets_for_skill("demo").unwrap().len(), 1);
    assert_eq!(
        store.get_skill_by_id("demo").unwrap().unwrap().source_ref,
        Some(skill.central_path)
    );
}

#[test]
fn unknown_tool_is_not_reported_as_a_target_conflict() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
    let error = sync_single_skill_to_tool(
        &store,
        "missing",
        "unknown_agent",
        DeployIntent::Managed,
        false,
    )
    .unwrap_err();
    assert_eq!(error.kind, ErrorKind::NotFound);
    assert!(error.details.is_none());
}
