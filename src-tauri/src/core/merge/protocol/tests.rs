use super::*;

#[test]
fn ensure_protocol_file_creates_and_is_sticky() {
    let tmp = tempfile::tempdir().unwrap();
    ensure_protocol_file(tmp.path()).unwrap();
    let raw = std::fs::read_to_string(tmp.path().join(PROTOCOL_FILE_REL)).unwrap();
    let parsed: ProtocolFile = serde_json::from_str(&raw).unwrap();
    assert_eq!(parsed.merge_protocol, MERGE_PROTOCOL_VERSION);

    // A future/higher version is never lowered.
    std::fs::write(
        tmp.path().join(PROTOCOL_FILE_REL),
        r#"{"schema_version":1,"merge_protocol":99}"#,
    )
    .unwrap();
    ensure_protocol_file(tmp.path()).unwrap();
    let raw = std::fs::read_to_string(tmp.path().join(PROTOCOL_FILE_REL)).unwrap();
    let parsed: ProtocolFile = serde_json::from_str(&raw).unwrap();
    assert_eq!(parsed.merge_protocol, 99);

    // A corrupt file is rewritten.
    std::fs::write(tmp.path().join(PROTOCOL_FILE_REL), "not json").unwrap();
    ensure_protocol_file(tmp.path()).unwrap();
    let raw = std::fs::read_to_string(tmp.path().join(PROTOCOL_FILE_REL)).unwrap();
    assert!(serde_json::from_str::<ProtocolFile>(&raw).is_ok());
}

#[test]
fn app_commit_message_appends_trailer_once() {
    let msg = app_commit_message("backup");
    assert_eq!(msg, "backup\n\nAgent-Hub-Protocol: 2");
    assert!(has_protocol_trailer(&msg));
    assert!(!has_protocol_trailer("backup"));
}

#[test]
fn parse_trailer_ids_splits_and_skips_overflow_marker() {
    let msg = "sync: merged\n\nAgent-Hub-Protocol: 2\nAgent-Hub-Conflicts: a, b, +3";
    assert_eq!(parse_trailer_ids(msg, TRAILER_CONFLICTS), vec!["a", "b"]);
    assert!(parse_trailer_ids(msg, TRAILER_RESOLVED).is_empty());
}

#[test]
fn conflicts_trailer_caps_at_twenty_ids() {
    let ids: Vec<String> = (0..25).map(|i| format!("id-{i:02}")).collect();
    let (line, overflowed) = format_conflicts_trailer(&ids).unwrap();
    assert!(overflowed);
    assert!(line.contains("+5"));
    assert_eq!(line.matches("id-").count(), 20);
    assert!(format_conflicts_trailer(&[]).is_none());

    let (line, overflowed) = format_conflicts_trailer(&["b".to_string(), "a".to_string()]).unwrap();
    assert!(!overflowed);
    // Sorted for determinism across devices.
    assert_eq!(line, "Agent-Hub-Conflicts: a, b");
}
