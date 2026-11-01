use super::*;
use tempfile::tempdir;

#[test]
fn log_audit_appends_and_lists_newest_first() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();

    store.log_audit(AuditDraft::new("install").skill("id1", "first").ok());
    store.log_audit(AuditDraft::new("install").skill("id2", "second").ok());
    store.log_audit(
        AuditDraft::new("remove")
            .skill("id1", "first")
            .fail("missing"),
    );

    let entries = store.list_audit(None).unwrap();
    assert_eq!(entries.len(), 3);
    // Newest first
    assert_eq!(entries[0].action, "remove");
    assert!(!entries[0].success);
    assert_eq!(entries[0].detail.as_deref(), Some("missing"));
    assert_eq!(entries[2].action, "install");
    assert_eq!(entries[2].skill_name.as_deref(), Some("first"));
}

#[test]
fn log_audit_respects_limit() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
    for i in 0..5 {
        store.log_audit(AuditDraft::new("sync").detail(format!("{i}")).ok());
    }
    let entries = store.list_audit(Some(2)).unwrap();
    assert_eq!(entries.len(), 2);
    // Newest first — latest detail is "4".
    assert_eq!(entries[0].detail.as_deref(), Some("4"));
}
