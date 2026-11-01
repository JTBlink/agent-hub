use super::*;
use serde_json::json;

#[tokio::test]
async fn maps_http_auth_and_cooldown_without_exposing_response_body() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    for (status, expected) in [
        (401, UsageStatus::AuthExpired),
        (403, UsageStatus::PermissionDenied),
        (429, UsageStatus::RateLimited),
    ] {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut headers = vec![0; 4096];
            let len = socket.read(&mut headers).await.unwrap();
            let request = String::from_utf8_lossy(&headers[..len]).to_ascii_lowercase();
            assert!(request.contains("authorization: bearer fixture-token"));
            assert!(request.contains("anthropic-beta: oauth-2025-04-20"));
            socket.write_all(format!("HTTP/1.1 {status} Failure\r\nContent-Length: 14\r\nRetry-After: 600\r\nConnection: close\r\n\r\nfixture-secret").as_bytes()).await.unwrap();
        });
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap();
        let result = request_usage(&client, &url, "fixture-token").await;
        let snapshot =
            result.unwrap_or_else(|status| ProviderUsage::empty(UsageProvider::Claude, status));
        assert_eq!(snapshot.status, expected);
        if status == 429 {
            assert_eq!(snapshot.retry_after_seconds, Some(600));
        }
        assert!(!serde_json::to_string(&snapshot)
            .unwrap()
            .contains("fixture-secret"));
        server.await.unwrap();
    }
}

#[test]
fn parses_zero_usage_and_model_windows_without_turning_absence_into_zero() {
    let snapshot = parse(&json!({"five_hour":{"utilization":0,"resets_at":"2026-11-01T00:00:00Z"},"seven_day":null,"seven_day_sonnet":{"utilization":80.5}})).unwrap();
    assert_eq!(snapshot.status, UsageStatus::Ready);
    assert_eq!(snapshot.windows.len(), 2);
    assert_eq!(snapshot.windows[0].used_percent, 0.0);
    assert_eq!(snapshot.windows[0].resets_at, Some(1793491200));
    assert_eq!(parse(&json!({})).unwrap().status, UsageStatus::NoData);
    for raw in [
        json!({"five_hour":{}}),
        json!({"five_hour":{"utilization":-1}}),
        json!([]),
    ] {
        assert_eq!(parse(&raw).unwrap_err(), UsageStatus::InvalidResponse);
    }
}
