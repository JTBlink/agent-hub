use super::*;
use serde_json::json;

#[test]
fn tab_names_use_lowercase_hyphens_and_the_next_number_for_their_workspace() {
    let snapshot: Snapshot = serde_json::from_value(json!({
        "version": "test",
        "tabs": [
            {"workspace_id":"w1", "tab_id":"t1", "label":"claude-code-1"},
            {"workspace_id":"w1", "tab_id":"t3", "label":"Claude Code 3"},
            {"workspace_id":"w1", "tab_id":"t4", "label":"codex-8"},
            {"workspace_id":"other", "tab_id":"t5", "label":"claude-code-20"}
        ]
    }))
    .unwrap();
    assert_eq!(
        numbered_tab_label(&snapshot, "w1", "Claude Code").unwrap(),
        "claude-code-4"
    );
    assert_eq!(
        numbered_tab_label(&snapshot, "w1", "CODEX").unwrap(),
        "codex-9"
    );
    assert_eq!(
        numbered_tab_label(&snapshot, "w1", "shell").unwrap(),
        "shell-1"
    );
}

#[test]
fn legacy_unnumbered_tabs_reserve_the_first_number_and_invalid_names_are_rejected() {
    let snapshot: Snapshot = serde_json::from_value(json!({
        "version":"test",
        "tabs":[{"workspace_id":"w1", "tab_id":"t1", "label":"Claude Agent Teams"}]
    }))
    .unwrap();
    assert_eq!(
        numbered_tab_label(&snapshot, "w1", "Claude Agent Teams").unwrap(),
        "claude-agent-teams-2"
    );
    assert!(numbered_tab_label(&snapshot, "w1", "---").is_err());
}
