use super::*;
use serde_json::json;

fn draft() -> AutomationDraft {
    serde_json::from_value(json!({"name":"Check", "provider":"system", "content":"echo check", "workdir":null,"schedule":{"kind":"manual"},"enabled":false,"files":[
        {"path":"scripts/reset.sh","content":"echo reset"},
        {"path":CONFIG,"content":json!({"version":1,"actions":[{"id":"reset","name":"Reset","script":"scripts/reset.sh"}]}).to_string()}
    ]})).unwrap()
}

#[test]
fn actions_are_optional_and_validate_declared_entries_and_unique_ids() {
    let mut value = draft();
    assert!(value.validate().is_ok());
    assert_eq!(read(&value).unwrap()[0].name, "Reset");
    for script in [
        "../outside.sh",
        "/outside.sh",
        "scripts/missing.sh",
        "config/settings.json",
    ] {
        value.files[1].content =
            json!({"version":1,"actions":[{"id":"reset","name":"Reset","script":script}]})
                .to_string();
        assert!(value.validate().is_err(), "{script}");
    }
    value = draft();
    value.files[1].content = json!({"version":1,"actions":[{"id":"same","name":"One","script":"scripts/reset.sh"},{"id":"same","name":"Two","script":"scripts/reset.sh"}]}).to_string();
    assert!(value.validate().is_err());
    value.files.pop();
    assert!(read(&value).unwrap().is_empty());
}

#[cfg(unix)]
#[test]
fn action_receives_context_preserves_business_state_and_records_success_and_failure() {
    let temp = tempfile::tempdir().unwrap();
    let directory = temp.path();
    fs::create_dir(directory.join(".local")).unwrap();
    fs::create_dir(directory.join("scripts")).unwrap();
    let mut draft = draft();
    draft.script_dir = Some(directory.to_string_lossy().into());
    let record = ManagedAutomation {
        id: format!("agent_hub:{}", uuid::Uuid::new_v4()),
        revision: 1,
        draft,
        source: "test".into(),
        identifier: "test".into(),
        location: String::new(),
    };
    let action = read(&record.draft).unwrap().remove(0);
    fs::write(
        directory.join("scripts/reset.sh"),
        "test \"$AGENT_HUB_ACTION_ID\" = reset || exit 2\nprintf '%s' \"$AGENT_HUB_STATE_DIR\"\n",
    )
    .unwrap();
    let result = execute(directory, &record, &action, false, None).unwrap();
    assert!(result.success);
    assert!(result.message.ends_with(".local/state"));
    let run = directory.join(".local/runs").join(result.run_id);
    assert_eq!(fs::read_to_string(run.join("exit")).unwrap(), "0");
    assert!(fs::read_to_string(run.join("output.log"))
        .unwrap()
        .contains("Reset"));
    assert!(!directory.join(".local/state/task-state.json").exists());
    fs::write(
        directory.join("scripts/reset.sh"),
        "echo broken >&2; exit 7",
    )
    .unwrap();
    let result = execute(directory, &record, &action, false, None).unwrap();
    assert!(!result.success);
    assert!(result.message.contains("broken"));
    fs::create_dir(directory.join(".local/run.claim")).unwrap();
    assert!(execute(directory, &record, &action, false, None).is_err());
}

#[cfg(unix)]
#[test]
fn preview_returns_structured_changes_and_bad_preview_does_not_execute_action() {
    let temp = tempfile::tempdir().unwrap();
    fs::create_dir(temp.path().join(".local")).unwrap();
    fs::create_dir(temp.path().join("scripts")).unwrap();
    let record = ManagedAutomation {
        id: format!("agent_hub:{}", uuid::Uuid::new_v4()),
        revision: 1,
        draft: draft(),
        source: "test".into(),
        identifier: "test".into(),
        location: String::new(),
    };
    let mut action = read(&record.draft).unwrap().remove(0);
    action.preview_arguments = Some(vec!["--preview".into()]);
    fs::write(temp.path().join("scripts/reset.sh"), "test \"$1\" = --preview || exit 2\nprintf '%s' '{\"summary\":\"Reset\",\"items\":[{\"label\":\"Attempts\",\"current\":\"3\",\"after\":\"0\"}],\"preserved\":[\"History\"],\"token\":\"v1\"}'").unwrap();
    let result = execute(temp.path(), &record, &action, true, None).unwrap();
    assert!(result.success);
    assert_eq!(result.preview.unwrap().items[0].after, "0");
    fs::write(temp.path().join("scripts/reset.sh"), "printf 'invalid'").unwrap();
    assert!(
        !execute(temp.path(), &record, &action, true, None)
            .unwrap()
            .success
    );
}
