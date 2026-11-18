use super::*;
use serde_json::json;

#[cfg(unix)]
#[test]
fn initial_prompt_returns_the_created_conversation_identity_for_follow_up() {
    use std::os::unix::fs::PermissionsExt;
    let _guard = crate::core::central_repo::test_base_dir_lock();
    let root = tempfile::tempdir().unwrap();
    crate::core::central_repo::set_test_base_dir_override(Some(root.path().into()));
    struct Reset;
    impl Drop for Reset {
        fn drop(&mut self) {
            crate::core::central_repo::set_test_base_dir_override(None);
        }
    }
    let _reset = Reset;
    let executable = root.path().join("herdr");
    let shell = json!({"pane_id":"shell","terminal_id":"shell-term","workspace_id":"space","tab_id":"tab","cwd":root.path()});
    let agent = json!({"pane_id":"agent","terminal_id":"agent-term","workspace_id":"space","tab_id":"tab","agent":"codex","name":"page-test","agent_status":"idle"});
    let mut conversation = agent.clone();
    conversation["agent_session"] = json!({"kind":"id","value":"conversation"});
    conversation["revision"] = json!(2);
    let snapshot = |pane: &Value| json!({"snapshot":{"version":"test","workspaces":[{"workspace_id":"space","label":"Test","active_tab_id":"tab"}],"panes":[shell],"agents":[pane]}});
    std::fs::write(&executable, format!(r##"#!/bin/sh
if [ "$1 $2" = 'session list' ]; then
  printf '%s' '{{"sessions":[{{"name":"default","running":true}}]}}'
  exit 0
fi
case "$3 $4" in
  'api snapshot')
    if [ -f "$0.prompt" ] && [ -f "$0.observed" ]; then
      printf '%s' '{}'
    elif [ -f "$0.started" ]; then
      if [ -f "$0.prompt" ]; then touch "$0.observed"; fi
      printf '%s' '{}'
    else
      printf '%s' '{}'
    fi ;;
  'pane split') printf '%s' '{}' ;;
  'agent start') touch "$0.started"; printf '%s' '{{}}' ;;
  'pane process-info') printf '%s' '{{"process_info":{{"shell_pid":1,"foreground_process_group_id":2,"foreground_processes":[{{"name":"codex","pid":2}}]}}}}' ;;
  'agent prompt') printf '%s\n' "$6" >> "$0.prompts"; touch "$0.prompt"; printf '%s' '{{}}' ;;
  *) printf 'Unexpected fixture command: %s\n' "$*" >&2; exit 2 ;;
esac
"##, snapshot(&conversation), snapshot(&agent), json!({"snapshot":{"version":"test","panes":[shell]}}), json!({"pane":agent}))).unwrap();
    std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o700)).unwrap();
    let control = HerdrControl::new(executable.clone());
    let target = Target::from_pane("default", &serde_json::from_value(shell).unwrap());
    let started = control
        .start_agent(
            &target,
            NewAgent {
                scheme_id: None,
                kind: "codex".into(),
                name: "page-test".into(),
                direction: "right".into(),
                teams: false,
                tab_label: None,
                prompt: "First feedback".into(),
            },
        )
        .unwrap();
    assert!(started.warning.is_none(), "{:?}", started.warning);
    assert_eq!(
        started.target.agent_session,
        conversation.get("agent_session").cloned()
    );
    control
        .action(&started.target, Action::Prompt, Some("Follow-up feedback"))
        .unwrap();
    let mut replaced = started.target.clone();
    replaced.agent_session = Some(json!({"kind":"id","value":"replacement"}));
    assert!(control
        .action(&replaced, Action::Prompt, Some("Must not send"))
        .is_err());
    assert_eq!(
        std::fs::read_to_string(executable.with_extension("prompts")).unwrap(),
        "First feedback\nFollow-up feedback\n"
    );
}

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
