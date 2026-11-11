use super::*;
use serde_json::{json, Value};

fn draft(manifest: Value) -> AutomationDraft {
    serde_json::from_value(json!({
        "name":"Review", "provider":"system", "content":"sh './scripts/run.sh'",
        "workdir":null, "enabled":false, "schedule":{"kind":"manual"},
        "files":[{"path":"prompts/prompt.md", "content":"Review only"},
            {"path":"config/prompt-variants.json", "content":manifest.to_string()}]
    }))
    .unwrap()
}

fn manifest() -> Value {
    json!({"version":1, "active_id":"review", "variants":[
        {"id":"review", "name":"Review"},
        {"id":"repair", "name":"Repair", "content":"Repair and verify"}
    ]})
}

#[test]
fn validates_portable_variants_and_retains_the_existing_runtime_prompt() {
    let mut task = draft(manifest());
    assert!(task.validate().is_ok());
    assert_eq!(task.files[0].content, "Review only");
    let encoded = serde_json::to_string(&task).unwrap();
    let mut restored: AutomationDraft = serde_json::from_str(&encoded).unwrap();
    assert!(restored.validate().is_ok());
    assert_eq!(restored, task);
}

#[test]
fn accepts_optional_behavior_markers_and_rejects_invalid_values() {
    let mut value = manifest();
    value["variants"][0]["behavior"] = json!("review");
    value["variants"][1]["behavior"] = json!("repair");
    assert!(draft(value).validate().is_ok());

    let mut value = manifest();
    value["variants"][0]["behavior"] = json!("x".repeat(121));
    assert!(draft(value).validate().is_err());

    let mut value = manifest();
    value["variants"][0]["behavior"] = json!("repair\nnow");
    assert!(draft(value).validate().is_err());
}

#[test]
fn rejects_missing_duplicate_or_ambiguous_selection_and_invalid_bodies() {
    let mut cases = Vec::new();
    let mut value = manifest();
    value["active_id"] = json!("absent");
    cases.push(value);
    let mut value = manifest();
    value["variants"][1]["id"] = json!("review");
    cases.push(value);
    let mut value = manifest();
    value["variants"][0]["content"] = json!("Second active copy");
    cases.push(value);
    let mut value = manifest();
    value["variants"][0]["content"] = Value::Null;
    cases.push(value);
    let mut value = manifest();
    value["variants"][1]["content"] = json!(" ");
    cases.push(value);
    let mut value = manifest();
    value["variants"][1]["name"] = json!(" ");
    cases.push(value);
    let mut value = manifest();
    value["variants"][1]["content"] = json!("\0");
    cases.push(value);
    for value in cases {
        assert!(draft(value).validate().is_err());
    }
    let mut task = draft(manifest());
    task.files.remove(0);
    assert!(task.validate().is_err());
}

#[test]
fn scenario_variables_have_no_count_cap_and_switch_with_the_active_scenario() {
    let mut value = manifest();
    value["variants"][0]["variables"] = json!((0..1200)
        .map(|n| json!({"name":format!("value_{n}"),"value":n.to_string()}))
        .collect::<Vec<_>>());
    value["variants"][1]["variables"] = json!([{"name":"limit","value":"10"}]);
    let mut task = draft(value);
    task.validate().unwrap();
    assert_eq!(active_variables(&task).unwrap().len(), 1200);
    let original = task.files[0].content.clone();
    set_prompt_variable(&mut task, Some("repair"), "limit", Some("12")).unwrap();
    assert_eq!(
        prompt_variables(&task, Some("repair")).unwrap().1["limit"],
        "12"
    );
    assert_eq!(active_variables(&task).unwrap().len(), 1200);
    assert_eq!(task.files[0].content, original);
    set_prompt_variable(&mut task, Some("repair"), "limit", None).unwrap();
    assert!(prompt_variables(&task, Some("repair"))
        .unwrap()
        .1
        .is_empty());
}

#[test]
fn invalid_variable_names_duplicates_and_nonstring_values_are_rejected_without_mutation() {
    for variables in [
        json!([{"name":"bad-name","value":"10"}]),
        json!([{"name":"same","value":"1"},{"name":"same","value":"2"}]),
        json!([{"name":"limit","value":10}]),
    ] {
        let mut value = manifest();
        value["variants"][0]["variables"] = variables;
        assert!(draft(value).validate().is_err());
    }
    let mut task = draft(manifest());
    let original = task.clone();
    assert!(set_prompt_variable(&mut task, None, "bad-name", Some("1")).is_err());
    assert_eq!(task, original);
}

#[test]
fn variable_descriptions_survive_value_edits_export_and_reopen() {
    let mut value = manifest();
    value["variants"][0]["variables"] = json!([
        {"name":"scope","value":"all","description":"own: current account; all: every author"},
        {"name":"limit","value":"10","description":"Maximum repair attempts"}
    ]);
    let mut task = draft(value);
    task.validate().unwrap();
    set_prompt_variable(&mut task, None, "scope", Some("own")).unwrap();
    let body: Value = serde_json::from_str(&task.files[1].content).unwrap();
    assert_eq!(
        body["variants"][0]["variables"][0]["description"],
        "own: current account; all: every author"
    );
    assert_eq!(body["variants"][0]["variables"][0]["value"], "own");
    assert_eq!(
        body["variants"][0]["variables"][1]["description"],
        "Maximum repair attempts"
    );
    let mut reopened: AutomationDraft =
        serde_json::from_str(&serde_json::to_string(&task).unwrap()).unwrap();
    reopened.validate().unwrap();
    assert_eq!(active_variables(&reopened).unwrap()["scope"], "own");
}

#[test]
fn invalid_variable_descriptions_are_rejected() {
    for description in [json!(42), json!("bad\0text"), json!("x".repeat(2001))] {
        let mut value = manifest();
        value["variants"][0]["variables"] =
            json!([{"name":"scope","value":"all","description":description}]);
        assert!(draft(value).validate().is_err());
    }
}

#[test]
fn suggestions_survive_custom_value_edits_and_reopen_without_entering_runtime_values() {
    let mut value = manifest();
    value["variants"][0]["variables"] = json!([
        {"name":"scope", "value":"own", "options":["own", "all"]}
    ]);
    let mut task = draft(value);
    task.validate().unwrap();
    set_prompt_variable(&mut task, None, "scope", Some("custom")).unwrap();
    let reopened: AutomationDraft =
        serde_json::from_str(&serde_json::to_string(&task).unwrap()).unwrap();
    let body: Value = serde_json::from_str(&reopened.files[1].content).unwrap();
    assert_eq!(
        body["variants"][0]["variables"][0]["options"],
        json!(["own", "all"])
    );
    assert_eq!(
        active_variables(&reopened).unwrap(),
        BTreeMap::from([("scope".into(), "custom".into())])
    );
}

#[test]
fn rejects_nonstring_or_nul_suggestions() {
    for options in [
        json!("own"),
        json!([42]),
        json!(["bad\0value"]),
        Value::Null,
    ] {
        let mut value = manifest();
        value["variants"][0]["variables"] =
            json!([{"name":"scope", "value":"own", "options":options}]);
        assert!(draft(value).validate().is_err());
    }
}
