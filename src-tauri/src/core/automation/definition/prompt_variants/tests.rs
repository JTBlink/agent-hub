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
