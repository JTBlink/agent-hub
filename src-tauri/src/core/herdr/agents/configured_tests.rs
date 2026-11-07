use super::*;

fn launch() -> Launch {
    Launch {
        key: "codex".into(),
        kind: Some("codex".into()),
        program: "codex".into(),
        arguments: vec![],
    }
}

#[test]
fn waits_only_for_explicit_pre_start_shell_rejection() {
    let mut attempts = 0;
    let result = start(&launch(), "reviewer", "w1:p1", |_, _| {
        attempts += 1;
        if attempts == 1 {
            return Err(crate::core::herdr::client::command_failure(
                r#"{"error":{"code":"agent_pane_busy","message":"shell initializing"}}"#,
            )
            .unwrap()
            .into());
        }
        Ok(serde_json::json!({"agent":{"agent_status":"idle"}}))
    })
    .unwrap();
    assert_eq!(attempts, 2);
    assert_eq!(result["agent"]["agent_status"], "idle");
}

#[test]
fn uncertain_startup_is_not_repeated() {
    let mut attempts = 0;
    assert!(start(&launch(), "reviewer", "w1:p1", |_, _| {
        attempts += 1;
        anyhow::bail!("startup timeout after an earlier agent_pane_busy; agent may already exist")
    })
    .is_err());
    assert_eq!(attempts, 1);
}
