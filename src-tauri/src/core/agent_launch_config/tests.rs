use super::*;
use crate::core::central_repo;

#[test]
fn reads_saved_launch_preferences_while_unrelated_backup_holds_repo_lock() {
    let _guard = central_repo::test_base_dir_lock();
    let tmp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(tmp.path().to_path_buf()));
    let result = std::panic::catch_unwind(|| {
        let initial = load().unwrap();
        let mut document = initial.document;
        document
            .instructions
            .insert("codex".into(), "codex --search".into());
        let saved = save(document, &initial.revision).unwrap();
        let _backup = RepoLock::acquire("background backup").unwrap();
        let start = std::time::Instant::now();
        let loaded = load().unwrap();
        eprintln!(
            "launch config read while repository locked: {:?}",
            start.elapsed()
        );
        assert_eq!(loaded.revision, saved.revision);
        assert_eq!(loaded.document.instructions["codex"], "codex --search");
        assert_eq!(resolve("codex").unwrap().arguments, ["--search"]);
    });
    central_repo::set_test_base_dir_override(None);
    result.unwrap();
}

#[cfg(feature = "cloud-sync")]
#[test]
fn does_not_return_launch_defaults_while_backup_recovery_is_pending() {
    let _guard = central_repo::test_base_dir_lock();
    let tmp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(tmp.path().to_path_buf()));
    let result = std::panic::catch_unwind(|| {
        // A damaged publication must surface recovery failure, not a successful
        // read of defaults from a temporarily absent configuration directory.
        fs::write(tmp.path().join("backup-publication.json"), "invalid").unwrap();
        assert!(load().is_err());
    });
    central_repo::set_test_base_dir_override(None);
    result.unwrap();
}

#[test]
fn saves_launch_preferences_with_revision_protection_and_preserves_unknown_agents() {
    let _guard = central_repo::test_base_dir_lock();
    let tmp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(tmp.path().to_path_buf()));
    let result = std::panic::catch_unwind(|| {
        let initial = load().unwrap();
        let mut document = initial.document;
        document.instructions.insert(
            "codex".into(),
            "codex --search --config 'note=hello world'".into(),
        );
        document
            .instructions
            .insert("future_agent".into(), "future-agent --continue".into());
        let saved = save(document.clone(), &initial.revision).unwrap();
        let resolved = resolve("codex").unwrap();
        assert_eq!(resolved.program, "codex");
        assert_eq!(
            resolved.arguments,
            ["--search", "--config", "note=hello world"]
        );
        assert!(save(document, &initial.revision).is_err());
        assert_eq!(
            load().unwrap().document.instructions["future_agent"],
            "future-agent --continue"
        );
        assert_ne!(saved.revision, initial.revision);
        assert!(resolve("hermes")
            .unwrap()
            .arguments
            .contains(&"--yolo".into()));
    });
    central_repo::set_test_base_dir_override(None);
    result.unwrap();
}

#[test]
fn rejects_malformed_commands_and_keeps_the_previous_document() {
    let _guard = central_repo::test_base_dir_lock();
    let tmp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(tmp.path().to_path_buf()));
    let result = std::panic::catch_unwind(|| {
        let initial = load().unwrap();
        for command in [
            "",
            "codex 'unfinished",
            "codex\n--search",
            "codex\0--search",
        ] {
            let mut invalid = initial.document.clone();
            invalid.instructions.insert("codex".into(), command.into());
            assert!(save(invalid, &initial.revision).is_err());
            assert_eq!(load().unwrap().revision, initial.revision);
        }
        let mut oversized = initial.document.clone();
        for index in 0..128 {
            oversized
                .instructions
                .insert(format!("future_{index}"), "x".repeat(8177));
        }
        assert!(save(oversized, &initial.revision).is_err());
        assert_eq!(load().unwrap().revision, initial.revision);
        let defaults = load().unwrap().defaults;
        for adapter in crate::core::tool_adapters::default_tool_adapters() {
            assert!(
                defaults
                    .get(&adapter.key)
                    .is_some_and(|instruction| parse(instruction).is_ok()),
                "Missing valid default for {}",
                adapter.key
            );
        }
        let mut document = initial.document;
        document.default_agent = "hermes".into();
        save(document, &initial.revision).unwrap();
        assert_eq!(resolve("default").unwrap().kind.as_deref(), Some("hermes"));
    });
    central_repo::set_test_base_dir_override(None);
    result.unwrap();
}
