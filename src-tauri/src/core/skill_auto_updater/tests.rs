use super::*;

#[test]
fn parse_interval_known_values() {
    assert_eq!(parse_interval("off"), None);
    assert_eq!(parse_interval(""), None);
    assert_eq!(parse_interval("1h"), Some(Duration::from_secs(3600)));
    assert_eq!(parse_interval("hourly"), Some(Duration::from_secs(3600)));
    assert_eq!(parse_interval("6h"), Some(Duration::from_secs(6 * 3600)));
    assert_eq!(parse_interval("24h"), Some(Duration::from_secs(86_400)));
    assert_eq!(parse_interval("daily"), Some(Duration::from_secs(86_400)));
    assert_eq!(parse_interval("7d"), None);
    assert_eq!(parse_interval("nonsense"), None);
}

#[test]
fn is_due_when_no_history() {
    assert!(is_due(None, Duration::from_secs(60)));
}

#[test]
fn is_due_after_interval() {
    let past = Utc::now() - chrono::Duration::hours(7);
    assert!(is_due(Some(past), Duration::from_secs(6 * 3600)));
}

#[test]
fn not_due_within_interval() {
    let past = Utc::now() - chrono::Duration::hours(1);
    assert!(!is_due(Some(past), Duration::from_secs(6 * 3600)));
}

#[test]
fn is_due_returns_false_when_interval_overflow() {
    // Duration::MAX is far larger than chrono::Duration can represent in
    // milliseconds, so the conversion fails. We must NOT then run on
    // every tick — the fallback should be "not due".
    let past = Utc::now() - chrono::Duration::hours(1);
    assert!(!is_due(Some(past), Duration::MAX));
}
