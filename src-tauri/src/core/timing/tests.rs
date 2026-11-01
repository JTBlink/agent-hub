use super::*;

#[test]
fn first_call_always_logs() {
    let flag = AtomicBool::new(true);
    assert!(should_log_first_or_slow(&flag, 0, 100));
    // Subsequent fast call is suppressed.
    assert!(!should_log_first_or_slow(&flag, 0, 100));
}

#[test]
fn slow_calls_log_even_after_first() {
    let flag = AtomicBool::new(true);
    // Consume the first-call privilege.
    assert!(should_log_first_or_slow(&flag, 0, 100));
    // Below threshold: suppressed.
    assert!(!should_log_first_or_slow(&flag, 50, 100));
    // At threshold: logged.
    assert!(should_log_first_or_slow(&flag, 100, 100));
    // Above threshold: logged.
    assert!(should_log_first_or_slow(&flag, 999, 100));
}
