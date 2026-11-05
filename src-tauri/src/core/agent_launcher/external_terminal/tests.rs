use super::*;
use anyhow::bail;

#[cfg(unix)]
#[test]
fn native_fallback_records_before_open_and_claims_the_command_only_once() {
    use std::os::unix::fs::PermissionsExt;
    let _lock = central_repo::test_base_dir_lock();
    let root = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(root.path().to_path_buf()));
    central_repo::set_test_home_dir_override(Some(root.path().to_path_buf()));
    let outcome = std::panic::catch_unwind(|| {
        let bridge = crate::core::cli_bridge::bridge_path();
        fs::create_dir_all(bridge.parent().unwrap()).unwrap();
        fs::write(&bridge, "#!/bin/sh\nexit 0\n").unwrap();
        fs::set_permissions(&bridge, fs::Permissions::from_mode(0o700)).unwrap();
        fs::write(
            bridge.parent().unwrap().join(".version"),
            env!("CARGO_PKG_VERSION"),
        )
        .unwrap();
        fs::write(
            bridge.parent().unwrap().join(".build-info.json"),
            serde_json::to_vec(&crate::product::current()).unwrap(),
        )
        .unwrap();
        let program = root.path().join("agent-fixture");
        fs::write(&program, "#!/bin/sh\nprintf '%s\\n' \"$@\" > argv.txt\n").unwrap();
        fs::set_permissions(&program, fs::Permissions::from_mode(0o700)).unwrap();
        let launch = Launch {
            key: "codex".into(),
            kind: Some("codex".into()),
            program: program.to_string_lossy().into(),
            arguments: vec!["--search".into()],
        };
        let mut receipt = None;
        let submitted = open(
            &launch,
            root.path(),
            Some("Review $(touch NEVER)\ncontext"),
            |value| {
                receipt = Some(value.clone());
                // Stop at the OS boundary. No real terminal or model is opened by this test.
                bail!("OS boundary intercepted")
            },
        );
        assert!(submitted.is_err());
        let receipt = receipt.unwrap();
        assert_eq!(status(&receipt.id).unwrap().phase, "submitted");
        assert_eq!(run(&receipt.id).unwrap(), 0);
        assert_eq!(
            fs::read_to_string(root.path().join("argv.txt")).unwrap(),
            "--search\n--\nReview $(touch NEVER)\ncontext\n"
        );
        assert!(!root.path().join("NEVER").exists());
        assert!(run(&receipt.id).is_err());
        assert_eq!(status(&receipt.id).unwrap().phase, "exited");
        assert!(!directory(&receipt.id)
            .unwrap()
            .join("request.json")
            .exists());
    });
    central_repo::set_test_base_dir_override(None);
    central_repo::set_test_home_dir_override(None);
    outcome.unwrap();
}
