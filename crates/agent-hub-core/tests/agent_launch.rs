use agent_hub_core::agent_launch::{normalize, resolve_document, Document};

#[test]
fn resolves_a_legacy_launch_scheme_for_an_external_caller() {
    let document: Document = serde_json::from_str(
        r#"{"schema_version":1,"default_agent":"codex","instructions":{"codex":"wrapper --config 'note=hello world'"}}"#,
    )
    .unwrap();

    assert!(resolve_document(&document, "default", None).is_err());
    let document = normalize(document).unwrap();
    let launch = resolve_document(&document, "default", Some("default")).unwrap();

    assert_eq!(launch.program, "wrapper");
    assert_eq!(launch.arguments, ["--config", "note=hello world"]);
    assert!(resolve_document(&document, "default", Some("removed")).is_err());
}
