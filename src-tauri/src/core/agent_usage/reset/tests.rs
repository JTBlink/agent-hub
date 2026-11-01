use super::*;
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt};

const KEY: &str = "fbab4e86-bb83-4c80-b650-7482626a48a9";

async fn mock_reset(outcome: &str, credit: Option<&str>, fail_refresh: bool) -> ResetResult {
    let (client, server) = tokio::io::duplex(16384);
    let (reader, writer) = tokio::io::split(client);
    let expected_credit = credit.map(str::to_owned);
    let outcome = outcome.to_owned();
    let responder = tokio::spawn(async move {
        let (reader, mut writer) = tokio::io::split(server);
        let mut reader = BufReader::new(reader);
        for method in [
            "initialize",
            "initialized",
            "account/read",
            "account/rateLimitResetCredit/consume",
            "account/rateLimits/read",
        ] {
            let mut line = String::new();
            reader.read_line(&mut line).await.unwrap();
            let request: Value = serde_json::from_str(&line).unwrap();
            assert_eq!(request["method"], method);
            if method == "initialized" {
                continue;
            }
            let result = match method {
                "account/read" => json!({"account":{"type":"chatgpt"}}),
                "account/rateLimitResetCredit/consume" => {
                    assert_eq!(request["params"]["idempotencyKey"], KEY);
                    assert_eq!(
                        request["params"].get("creditId").and_then(Value::as_str),
                        expected_credit.as_deref()
                    );
                    json!({"outcome":outcome})
                }
                "account/rateLimits/read" if fail_refresh => {
                    writer
                        .write_all(b"{\"id\":4,\"error\":{\"message\":\"401 fixture-secret\"}}\n")
                        .await
                        .unwrap();
                    continue;
                }
                "account/rateLimits/read" => {
                    json!({"rateLimits":{"primary":{"usedPercent":0}},"rateLimitResetCredits":{"availableCount":1,"credits":null}})
                }
                _ => json!({}),
            };
            codex::send(&mut writer, json!({"id":request["id"],"result":result}))
                .await
                .unwrap();
        }
    });
    let result = exchange(writer, reader, KEY, credit).await.unwrap();
    responder.await.unwrap();
    result
}

#[tokio::test]
async fn consumes_selected_or_server_chosen_credit_and_fetches_fresh_quota() {
    for credit in [Some("reset-example"), None] {
        let result = mock_reset("reset", credit, false).await;
        assert_eq!(result.outcome, ResetOutcome::Reset);
        let snapshot = result.snapshot.unwrap();
        assert_eq!(snapshot.windows[0].used_percent, 0.0);
        assert_eq!(snapshot.reset_credits.unwrap().available_count, 1);
        assert_eq!(result.refresh_error, None);
    }
}

#[tokio::test]
async fn handles_idempotent_retry_and_non_consuming_outcomes() {
    for (raw, expected) in [
        ("alreadyRedeemed", ResetOutcome::AlreadyRedeemed),
        ("nothingToReset", ResetOutcome::NothingToReset),
        ("noCredit", ResetOutcome::NoCredit),
    ] {
        assert_eq!(
            mock_reset(raw, Some("reset-example"), false).await.outcome,
            expected
        );
    }
}

#[tokio::test]
async fn preserves_success_when_refresh_fails_and_sanitizes_error() {
    let result = mock_reset("reset", Some("reset-example"), true).await;
    assert_eq!(result.outcome, ResetOutcome::Reset);
    assert!(result.snapshot.is_none());
    assert_eq!(result.refresh_error, Some(UsageStatus::AuthExpired));
    assert!(!serde_json::to_string(&result)
        .unwrap()
        .contains("fixture-secret"));
}

#[tokio::test]
async fn refuses_non_subscribed_accounts_before_sending_consumption() {
    let output =
        b"{\"id\":1,\"result\":{}}\n{\"id\":2,\"result\":{\"account\":{\"type\":\"apiKey\"}}}\n";
    let mut written = Vec::new();
    let result = exchange(&mut written, output.as_slice(), KEY, None).await;
    assert_eq!(result.unwrap_err(), UsageStatus::Unsupported);
    assert!(!String::from_utf8(written)
        .unwrap()
        .contains("rateLimitResetCredit/consume"));
}

#[tokio::test]
async fn rejects_invalid_request_identifiers_before_starting_a_process() {
    for (key, credit) in [("", None), ("not-a-uuid", None), (KEY, Some(" "))] {
        assert_eq!(
            consume(key.into(), credit.map(str::to_owned), None)
                .await
                .unwrap_err(),
            UsageStatus::InvalidResponse
        );
    }
}
