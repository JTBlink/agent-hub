use super::*;
#[test]
fn records_configured_execution_without_mutable_profile_reinterpretation() {
    for (remote, proxy, network) in [
        (false, false, "client_default"),
        (true, false, "server_default"),
        (false, true, "proxy"),
        (true, true, "proxy"),
    ] {
        let mut profile = BrowserProfile {
            endpoint: remote.then(|| "http://127.0.0.1:9222".into()),
            proxy: proxy.then(|| "socks5://127.0.0.1:1080".into()),
            ..Default::default()
        };
        let execution = Execution::from_profile(&profile);
        profile.endpoint = None;
        profile.proxy = None;
        assert_eq!(
            serde_json::to_value(Execution::from_profile(&profile)).unwrap(),
            serde_json::json!({"render":"client","network":"client_default"})
        );
        assert_eq!(
            serde_json::to_value(execution).unwrap(),
            serde_json::json!({"render":if remote{"server"}else{"client"},"network":network})
        );
    }
}
