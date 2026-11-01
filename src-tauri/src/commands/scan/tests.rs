use super::match_imported_skill_id;
use crate::core::skill_store::{DiscoveredSkillRecord, SkillRecord};

fn managed_skill(
    id: &str,
    name: &str,
    source_ref: Option<&str>,
    source_ref_resolved: Option<&str>,
    content_hash: Option<&str>,
) -> SkillRecord {
    SkillRecord {
        id: id.to_string(),
        name: name.to_string(),
        description: None,
        source_type: "import".to_string(),
        source_ref: source_ref.map(str::to_string),
        source_ref_resolved: source_ref_resolved.map(str::to_string),
        source_subpath: None,
        source_branch: None,
        source_revision: None,
        source_agent: None,
        remote_revision: None,
        central_path: format!("/central/{name}"),
        content_hash: content_hash.map(str::to_string),
        enabled: true,
        created_at: 0,
        updated_at: 0,
        status: "ok".to_string(),
        update_status: "local_only".to_string(),
        last_checked_at: None,
        last_check_error: None,
    }
}

fn discovered(path: &str, name: &str, fingerprint: Option<&str>) -> DiscoveredSkillRecord {
    DiscoveredSkillRecord {
        id: "discovered-1".to_string(),
        tool: "cursor".to_string(),
        found_path: path.to_string(),
        name_guess: Some(name.to_string()),
        fingerprint: fingerprint.map(str::to_string),
        found_at: 0,
        imported_skill_id: None,
    }
}

#[test]
fn does_not_mark_same_name_as_imported_without_path_or_hash_match() {
    let rec = discovered("/tmp/local/foo", "same-name", None);
    let managed = vec![managed_skill(
        "skill-1",
        "same-name",
        Some("/tmp/other/foo"),
        None,
        None,
    )];

    assert_eq!(match_imported_skill_id(&rec, &managed), None);
}

#[test]
fn marks_same_fingerprint_as_imported() {
    let rec = discovered("/tmp/local/foo", "same-name", Some("abc123"));
    let managed = vec![managed_skill(
        "skill-1",
        "different-name",
        Some("/tmp/other/foo"),
        None,
        Some("abc123"),
    )];

    assert_eq!(
        match_imported_skill_id(&rec, &managed),
        Some("skill-1".to_string())
    );
}

#[test]
fn marks_same_source_path_as_imported() {
    let rec = discovered("/tmp/local/foo", "same-name", None);
    let managed = vec![managed_skill(
        "skill-1",
        "different-name",
        Some("/tmp/local/foo"),
        None,
        None,
    )];

    assert_eq!(
        match_imported_skill_id(&rec, &managed),
        Some("skill-1".to_string())
    );
}
