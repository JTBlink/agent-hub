use super::*;

#[test]
fn lifecycle_preserves_ownership_and_recovers_without_duplicate_delivery() {
    let root = tempfile::tempdir().unwrap();
    for directory in ["scripts", "config", "prompts"] {
        std::fs::create_dir(root.path().join(directory)).unwrap();
    }
    std::fs::write(
        root.path().join("scripts/runtime.py"),
        include_str!("runtime.py"),
    )
    .unwrap();
    std::fs::write(
        root.path().join("scripts/herdr_backend.py"),
        include_str!("../herdr/agent_execution.py"),
    )
    .unwrap();
    std::fs::write(
        root.path().join("scripts/state_store.py"),
        include_str!("../state_store/store.py"),
    )
    .unwrap();
    std::fs::write(
        root.path().join("config/agent.json"),
        r#"{"runner":{"kind":"codex","session":"default","title":"Review"},"launch":{"arguments":[]},"execution":{"wait_timeout_seconds":1800}}"#,
    )
    .unwrap();
    std::fs::write(
        root.path().join("prompts/prompt.md"),
        "Review the selected request",
    )
    .unwrap();
    let result = Command::new(crate::core::python_support::interpreter().unwrap())
        .arg("-c")
        .arg(include_str!("fixtures/lifecycle_checks.py"))
        .arg(root.path().join("scripts/runtime.py"))
        .env_remove("AGENT_HUB_CLI")
        .env_remove("AGENT_HUB_STATE_DIR")
        .env_remove("AGENT_HUB_TASK_DIR")
        .env(
            "AGENT_HUB_HERDR_RUNTIME",
            root.path().join("scripts/herdr_backend.py"),
        )
        .env(
            "AGENT_HUB_STATE_RUNTIME",
            root.path().join("scripts/state_store.py"),
        )
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}\n{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
}

#[test]
fn inspecting_state_is_read_only_and_does_not_reset_bad_records() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("execution");
    assert!(status_at(&path).unwrap().is_none());
    assert!(!path.exists());
    std::fs::create_dir(&path).unwrap();
    let record = path.join(".herdr-run.json");
    std::fs::write(&record, "not JSON").unwrap();
    assert!(status_at(&path).is_err());
    assert_eq!(std::fs::read_to_string(&record).unwrap(), "not JSON");
}
