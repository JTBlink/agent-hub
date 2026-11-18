use super::*;

#[test]
fn migrates_a_single_instruction_without_changing_its_command() {
    let legacy: Document = serde_json::from_str(r#"{"schema_version":1,"default_agent":"codex","instructions":{"codex":"custom-codex --search"}}"#).unwrap();
    let migrated = normalize(legacy).unwrap();
    assert_eq!(migrated.schema_version, 2);
    assert!(migrated.instructions.is_empty());
    assert_eq!(migrated.schemes["codex"].default_id, "default");
    assert_eq!(migrated.schemes["codex"].items[0].name, "默认");
    assert_eq!(
        migrated.schemes["codex"].items[0].instruction,
        "custom-codex --search"
    );
    let encoded = serde_json::to_string(&migrated).unwrap();
    assert!(!encoded.contains("\"instructions\""));
    let restored: Document = serde_json::from_str(&encoded).unwrap();
    assert_eq!(
        resolve_document(&restored, "codex", Some("default"))
            .unwrap()
            .program,
        "custom-codex"
    );
}

#[test]
fn resolves_fixed_and_default_scheme_references_and_rejects_deleted_ids() {
    let mut document = Document::default();
    document.schemes.insert(
        "codex".into(),
        AgentSchemes {
            default_id: "automatic".into(),
            items: vec![
                LaunchScheme {
                    id: "automatic".into(),
                    name: "Automatic".into(),
                    instruction: "codex --dangerously-bypass-approvals-and-sandbox".into(),
                },
                LaunchScheme {
                    id: "custom".into(),
                    name: "Custom".into(),
                    instruction: "custom-codex --search".into(),
                },
            ],
        },
    );
    assert_eq!(
        resolve_document(&document, "codex", None).unwrap().program,
        "codex"
    );
    assert_eq!(
        resolve_document(&document, "codex", Some("custom"))
            .unwrap()
            .program,
        "custom-codex"
    );
    document.schemes.get_mut("codex").unwrap().default_id = "custom".into();
    assert_eq!(
        resolve_document(&document, "codex", None).unwrap().program,
        "custom-codex"
    );
    assert_eq!(
        resolve_document(&document, "codex", Some("automatic"))
            .unwrap()
            .program,
        "codex"
    );
    document.schemes.get_mut("codex").unwrap().items.remove(0);
    assert!(resolve_document(&document, "codex", Some("automatic")).is_err());
    assert!(resolve_document(&document, "claude", Some("custom")).is_err());
}

#[test]
fn refuses_a_stale_resolved_plan_before_starting_a_process() {
    let document = Document::default();
    let mut launch = resolve_document(&document, "codex", None).unwrap();
    let fingerprint = plan_fingerprint(&launch).unwrap();
    assert!(verify_plan(&launch, Some(&fingerprint)).is_ok());
    launch.program = "custom-codex".into();
    assert!(verify_plan(&launch, Some(&fingerprint)).is_err());
    assert!(verify_plan(&launch, None).is_ok());
}

#[test]
fn built_in_cli_defaults_use_their_native_full_access_options_without_model_pins() {
    let defaults = defaults::instructions();
    for (key, instruction) in [
        ("codex", "codex --dangerously-bypass-approvals-and-sandbox"),
        ("claude_code", "claude --dangerously-skip-permissions"),
        ("opencode", "opencode --auto"),
        ("hermes", "hermes --yolo"),
        ("cursor", "cursor-agent --force"),
        ("github_copilot", "copilot --yolo"),
        ("gemini_cli", "gemini --yolo"),
        ("qwen_code", "qwen --yolo"),
        ("kilo_code", "kilo --auto"),
        ("kiro", "kiro-cli chat --trust-all-tools"),
        ("kimi", "kimi --yolo"),
        ("cline", "cline --auto-approve true"),
        ("droid", "droid --skip-permissions-unsafe"),
    ] {
        assert_eq!(defaults[key], instruction);
    }
}

#[test]
fn edits_shared_schemes_and_preserves_default_references_transactionally() {
    let _guard = crate::core::central_repo::test_base_dir_lock();
    let tmp = tempfile::tempdir().unwrap();
    crate::core::central_repo::set_test_base_dir_override(Some(tmp.path().into()));
    let result = std::panic::catch_unwind(|| {
        edit_schemes(
            "codex",
            SchemeEdit::Add {
                id: "custom".into(),
                name: "Custom".into(),
                instruction: "codex-yolo".into(),
                default: false,
            },
        )
        .unwrap();
        let before = load().unwrap();
        assert!(edit_schemes(
            "codex",
            SchemeEdit::Delete {
                id: "default".into(),
                replacement: None
            }
        )
        .is_err());
        assert_eq!(load().unwrap().revision, before.revision);
        assert!(edit_schemes(
            "codex",
            SchemeEdit::Add {
                id: "custom".into(),
                name: "Duplicate".into(),
                instruction: "codex".into(),
                default: false
            }
        )
        .is_err());
        edit_schemes(
            "codex",
            SchemeEdit::Update {
                id: "custom".into(),
                name: Some("Renamed".into()),
                instruction: Some("wrapper --auto".into()),
            },
        )
        .unwrap();
        edit_schemes(
            "codex",
            SchemeEdit::SetDefault {
                id: "custom".into(),
            },
        )
        .unwrap();
        assert_eq!(resolve("codex").unwrap().program, "wrapper");
        edit_schemes(
            "codex",
            SchemeEdit::Delete {
                id: "custom".into(),
                replacement: Some("default".into()),
            },
        )
        .unwrap();
        assert!(resolve_scheme("codex", Some("custom")).is_err());
        assert!(edit_schemes(
            "codex",
            SchemeEdit::Delete {
                id: "default".into(),
                replacement: None
            }
        )
        .is_err());
        assert!(load().unwrap().document.instructions.is_empty());
    });
    crate::core::central_repo::set_test_base_dir_override(None);
    result.unwrap();
}
