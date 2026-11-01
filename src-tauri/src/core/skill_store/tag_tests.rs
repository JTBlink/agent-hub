use super::*;
use tempfile::tempdir;

fn skill(id: &str) -> SkillRecord {
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

#[test]
fn rename_tag_updates_all_and_merges_into_existing() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
    store.insert_skill(&skill("a")).unwrap();
    store.insert_skill(&skill("b")).unwrap();
    store.set_tags_for_skill("a", &["old".into()]).unwrap();
    // b already carries the target name, so the rename must merge, not dup.
    store
        .set_tags_for_skill("b", &["old".into(), "new".into()])
        .unwrap();

    let mut affected = store.rename_tag("old", "new").unwrap();
    affected.sort();
    assert_eq!(affected, vec!["a".to_string(), "b".to_string()]);

    assert_eq!(store.get_all_tags().unwrap(), vec!["new".to_string()]);
    let map = store.get_tags_map().unwrap();
    assert_eq!(map.get("a").unwrap(), &vec!["new".to_string()]);
    assert_eq!(map.get("b").unwrap(), &vec!["new".to_string()]);
}

#[test]
fn rename_tag_to_itself_is_noop_not_delete() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
    store.insert_skill(&skill("a")).unwrap();
    store.set_tags_for_skill("a", &["keep".into()]).unwrap();

    let affected = store.rename_tag("keep", "keep").unwrap();
    assert_eq!(affected, vec!["a".to_string()]);
    // The tag must survive a self-rename, not be wiped.
    assert_eq!(store.get_all_tags().unwrap(), vec!["keep".to_string()]);
}

#[test]
fn delete_tag_removes_from_all_skills() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
    store.insert_skill(&skill("a")).unwrap();
    store.insert_skill(&skill("b")).unwrap();
    store
        .set_tags_for_skill("a", &["keep".into(), "drop".into()])
        .unwrap();
    store.set_tags_for_skill("b", &["drop".into()]).unwrap();

    let mut affected = store.delete_tag("drop").unwrap();
    affected.sort();
    assert_eq!(affected, vec!["a".to_string(), "b".to_string()]);
    assert_eq!(store.get_all_tags().unwrap(), vec!["keep".to_string()]);
    let map = store.get_tags_map().unwrap();
    assert_eq!(map.get("a").unwrap(), &vec!["keep".to_string()]);
    assert!(!map.contains_key("b"));
}
