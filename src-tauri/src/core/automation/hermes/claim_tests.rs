#[test]
fn native_execution_claims_remain_running_even_after_future_runs_are_paused() {
    let tasks = super::parse(r#"{"jobs":[{"id":"active","enabled":true,"fire_claim":{"by":"worker"}},{"id":"paused","enabled":false,"run_claim":{"by":"worker"}},{"id":"idle","enabled":true,"fire_claim":null}]}"#, "default", "<profile>/cron/jobs.json").unwrap();
    assert_eq!(tasks[0].status, "running");
    assert_eq!(tasks[1].status, "running");
    assert_eq!(tasks[2].status, "active");
}
