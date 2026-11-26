use super::*;

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
