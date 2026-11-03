use super::*;
use serde_json::json;

fn account() -> Value {
    json!({"type":"chatgpt", "email":"user@example.invalid", "planType":"plus"})
}

fn auth(metadata: Value) -> Vec<u8> {
    let claims = json!({"email":"user@example.invalid", "https://api.openai.com/auth":metadata});
    let payload = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&claims).unwrap());
    serde_json::to_vec(&json!({"tokens":{"id_token":format!("header.{payload}.signature")}}))
        .unwrap()
}

#[test]
fn returns_only_subscription_dates_for_the_matching_live_identity() {
    let bytes = auth(json!({
        "chatgpt_plan_type":"plus",
        "chatgpt_subscription_active_until":"2027-01-15T00:00:00Z",
        "chatgpt_subscription_last_checked":"2027-01-01T00:00:00Z"
    }));
    let period = parse(&bytes, &account()).unwrap();
    assert_eq!(period.active_until, 1799971200);
    assert_eq!(period.last_checked_at, Some(1798761600));
    let serialized = serde_json::to_value(period).unwrap();
    assert_eq!(serialized.as_object().unwrap().len(), 2);
    for other in [
        json!({"type":"chatgpt","email":"other@example.invalid","planType":"plus"}),
        json!({"type":"chatgpt","email":"user@example.invalid","planType":"pro"}),
        json!({"type":"chatgpt","planType":"plus"}),
        json!({"type":"apiKey"}),
    ] {
        assert!(parse(&bytes, &other).is_none());
    }
}

#[test]
fn missing_or_invalid_subscription_metadata_is_optional() {
    for bytes in [
        b"not json".to_vec(),
        b"{}".to_vec(),
        br#"{"tokens":{"id_token":"bad.token"}}"#.to_vec(),
        br#"{"tokens":{"id_token":"bad.!.token"}}"#.to_vec(),
        auth(json!({"chatgpt_plan_type":"plus","chatgpt_subscription_active_until":null})),
        auth(json!({"chatgpt_plan_type":"plus","chatgpt_subscription_active_until":"invalid"})),
    ] {
        assert!(parse(&bytes, &account()).is_none());
    }
    let bytes = auth(json!({
        "chatgpt_plan_type":"plus",
        "chatgpt_subscription_active_until":"2027-01-15T00:00:00Z"
    }));
    assert!(parse(&bytes, &account()).unwrap().last_checked_at.is_none());
}

#[tokio::test]
async fn missing_and_oversized_credential_files_do_not_expose_metadata() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("auth.json");
    assert!(credentials::read_json_file(&path).await.unwrap().is_none());
    std::fs::write(&path, vec![b' '; 1024 * 1024 + 1]).unwrap();
    assert!(credentials::read_json_file(&path).await.is_err());
}
