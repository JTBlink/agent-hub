use super::*;

#[test]
fn captures_auth_status_on_stderr_without_polluting_api_json() {
    let args = [
        "-c",
        "printf '{\"login\":\"demo\"}'; printf 'Logged in to github.example.invalid' >&2",
    ];
    let (stdout, stderr) = capture("sh", &args, &[], 5, None, None).unwrap();
    assert_eq!(stdout, "{\"login\":\"demo\"}");
    assert_eq!(stderr, "Logged in to github.example.invalid");
    assert_eq!(run("sh", &args, &[], 5, None, None).unwrap(), stdout);
}

#[test]
fn cancellation_reaps_owned_descendants() {
    use std::sync::atomic::{AtomicBool, Ordering};
    let root = tempfile::tempdir().unwrap();
    let signal = root.path().join("descendant-finished");
    let canceled = AtomicBool::new(false);
    std::thread::scope(|scope| {
        let worker = scope.spawn(|| {
            let mut command = Command::new("sh");
            command
                .args(["-c", "(sleep 0.5; touch \"$1\") & wait", "fixture"])
                .arg(&signal);
            capture_prepared(command, "fixture", 5, Some(&canceled))
        });
        std::thread::sleep(Duration::from_millis(100));
        canceled.store(true, Ordering::Release);
        assert!(worker.join().unwrap().is_err());
    });
    std::thread::sleep(Duration::from_millis(600));
    assert!(!signal.exists());
}
