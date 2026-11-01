use super::*;

#[test]
fn object_merge_is_default_and_system_is_the_escape_hatch() {
    let tmp = tempfile::tempdir().unwrap();
    let store = crate::core::skill_store::SkillStore::new(&tmp.path().join("t.db")).unwrap();
    // 3d-β: on by default (no setting saved).
    assert!(object_merge_enabled(&store));
    // Users who opted in during 3d-α stay on.
    store.set_setting(SETTING_MERGE_ENGINE, "object").unwrap();
    assert!(object_merge_enabled(&store));
    // Explicit escape hatch back to the line-level merge.
    store.set_setting(SETTING_MERGE_ENGINE, "system").unwrap();
    assert!(!object_merge_enabled(&store));
}
