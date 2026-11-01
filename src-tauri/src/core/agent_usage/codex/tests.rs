use super::*;

#[test]
fn prefers_codex_bucket_and_classifies_windows_by_duration() {
    let snapshot = parse(&json!({"rateLimits":{"primary":{"usedPercent":99}},"rateLimitsByLimitId":{"codex":{"primary":{"usedPercent":80,"windowDurationMins":10080,"resetsAt":1793491200},"secondary":{"usedPercent":0,"windowDurationMins":300}}}})).unwrap();
    assert_eq!(snapshot.windows[0].key, "seven_day");
    assert_eq!(snapshot.windows[0].used_percent, 80.0);
    assert_eq!(snapshot.windows[1].key, "five_hour");
    assert_eq!(snapshot.windows[1].used_percent, 0.0);
    assert_eq!(
        parse(&json!({"rateLimits":{}})).unwrap().status,
        UsageStatus::NoData
    );
    assert_eq!(
        parse(&json!({"rateLimits":{"primary":{"usedPercent":101}}})).unwrap_err(),
        UsageStatus::InvalidResponse
    );
}

async fn mock_exchange(account: Value, quota: Value) -> Result<ProviderUsage, UsageStatus> {
    let (client, server) = tokio::io::duplex(16384);
    let (input, output) = tokio::io::split(client);
    let responder = tokio::spawn(async move {
        let (input, mut output) = tokio::io::split(server);
        let mut reader = BufReader::new(input);
        let methods = [
            "initialize",
            "initialized",
            "account/read",
            "account/rateLimits/read",
        ];
        for method in methods {
            let mut line = String::new();
            if reader.read_line(&mut line).await.unwrap() == 0 {
                break;
            }
            let request: Value = serde_json::from_str(&line).unwrap();
            assert_eq!(request["method"], method);
            if method == "initialized" {
                continue;
            }
            if method == "account/read" {
                assert_eq!(request["params"]["refreshToken"], false);
            }
            let result = match method {
                "account/read" => account.clone(),
                "account/rateLimits/read" => quota.clone(),
                _ => json!({}),
            };
            send(&mut output, json!({"id":request["id"],"result":result}))
                .await
                .unwrap();
        }
    });
    let result = exchange(output, input).await;
    responder.await.unwrap();
    result
}

#[tokio::test]
async fn only_queries_subscribed_accounts_and_never_starts_a_thread() {
    let quota = json!({"rateLimits":{"primary":{"usedPercent":42,"windowDurationMins":300}}});
    let snapshot = mock_exchange(
        json!({"requiresOpenaiAuth":true,"account":{"type":"chatgpt"}}),
        quota,
    )
    .await
    .unwrap();
    assert_eq!(snapshot.windows[0].used_percent, 42.0);
    for (account, expected) in [
        (
            json!({"requiresOpenaiAuth":false,"account":null}),
            UsageStatus::Unsupported,
        ),
        (
            json!({"requiresOpenaiAuth":true,"account":null}),
            UsageStatus::SignedOut,
        ),
        (
            json!({"requiresOpenaiAuth":true,"account":{"type":"apiKey"}}),
            UsageStatus::Unsupported,
        ),
    ] {
        assert_eq!(
            mock_exchange(account, json!({})).await.unwrap_err(),
            expected
        );
    }
}

#[tokio::test]
async fn rejects_excessive_or_unexpected_rpc_output_and_sanitizes_errors() {
    let bytes = b"{\"id\":1,\"error\":{\"message\":\"401 fixture-secret\"}}\n";
    assert_eq!(
        exchange(tokio::io::sink(), bytes.as_slice())
            .await
            .unwrap_err(),
        UsageStatus::AuthExpired
    );
    let bytes = vec![b'x'; MAX_RPC_BYTES as usize + 1];
    assert_eq!(
        exchange(tokio::io::sink(), bytes.as_slice())
            .await
            .unwrap_err(),
        UsageStatus::InvalidResponse
    );
}

#[cfg(unix)]
#[tokio::test]
async fn bounds_and_reaps_an_unresponsive_probe() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    let executable = dir.path().join("codex-fixture");
    std::fs::write(&executable, "#!/bin/sh\nexec sleep 30\n").unwrap();
    std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o700)).unwrap();
    let started = std::time::Instant::now();
    assert_eq!(
        query_command(&executable, Duration::from_millis(100), None)
            .await
            .unwrap_err(),
        UsageStatus::NetworkError
    );
    assert!(started.elapsed() < Duration::from_secs(3));
}

#[tokio::test]
async fn ignores_cli_startup_noise_without_losing_rpc_responses() {
    let bytes = b"starting CLI wrapper\n\n{\"method\":\"notice\"}\n{\"id\":1,\"result\":{}}\n{\"id\":2,\"result\":{\"requiresOpenaiAuth\":true,\"account\":{\"type\":\"chatgpt\"}}}\n{\"id\":3,\"result\":{\"rateLimits\":{\"primary\":{\"usedPercent\":61,\"windowDurationMins\":10080}}}}\n";
    let snapshot = exchange(tokio::io::sink(), bytes.as_slice()).await.unwrap();
    assert_eq!(snapshot.status, UsageStatus::Ready);
    assert_eq!(snapshot.windows[0].used_percent, 61.0);
}

#[tokio::test]
async fn queries_chatgpt_quota_even_when_the_configured_model_needs_no_openai_auth() {
    let snapshot = mock_exchange(
        json!({"requiresOpenaiAuth":false,"account":{"type":"chatgpt"}}),
        json!({"rateLimits":{"primary":{"usedPercent":61,"windowDurationMins":10080}}}),
    )
    .await
    .unwrap();
    assert_eq!(snapshot.status, UsageStatus::Ready);
}

#[test]
fn reads_available_reset_credits_without_inventing_counts_or_expiry() {
    let snapshot = parse(&json!({
        "rateLimits": {},
        "rateLimitResetCredits": {"availableCount": 4, "credits": [
            {"status":"available", "resetType":"codexRateLimits", "expiresAt":1793491200},
            {"status":"available", "resetType":"futureType", "title":"Example reset", "expiresAt":null},
            {"status":"redeemed", "resetType":"codexRateLimits"}
        ]}
    })).unwrap();
    assert_eq!(snapshot.status, UsageStatus::Ready);
    let resets = snapshot.reset_credits.unwrap();
    assert_eq!(resets.available_count, 4);
    let credits = resets.credits.unwrap();
    assert_eq!(credits.len(), 2);
    assert_eq!(credits[0].expires_at, Some(1793491200));
    assert_eq!(credits[0].title, None);
    assert_eq!(credits[1].expires_at, None);
    assert_eq!(credits[1].title.as_deref(), Some("Example reset"));
}

#[test]
fn distinguishes_missing_reset_data_zero_credits_and_count_only_responses() {
    for raw in [Value::Null, json!({}), json!({"availableCount":-1})] {
        assert!(parse_reset_credits(&raw).is_none());
    }
    let zero = parse_reset_credits(&json!({"availableCount":0,"credits":[]})).unwrap();
    assert_eq!(zero.available_count, 0);
    assert!(zero.credits.unwrap().is_empty());
    let count = parse_reset_credits(&json!({"availableCount":2,"credits":null})).unwrap();
    assert_eq!(count.available_count, 2);
    assert!(count.credits.is_none());
    let legacy = parse(&json!({"rateLimits":{"primary":{"usedPercent":42}}})).unwrap();
    assert!(legacy.reset_credits.is_none());
    assert_eq!(legacy.status, UsageStatus::Ready);
}
