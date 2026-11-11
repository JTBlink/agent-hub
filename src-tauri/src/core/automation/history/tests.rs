use super::*;

#[test]
fn completed_history_does_not_query_a_scheduler() {
    let dir = tempfile::tempdir().unwrap();
    let run = dir.path().join("runs/finished");
    fs::create_dir_all(&run).unwrap();
    fs::write(dir.path().join("current-run"), "finished").unwrap();
    fs::write(run.join("started"), "2026-10-27T01:00:00Z").unwrap();
    fs::write(run.join("exit"), "0").unwrap();
    let history =
        native_history(dir.path(), || panic!("completed runs need no scheduler")).unwrap();
    assert_eq!(history.runs[0].status, "completed");
}

#[test]
fn only_the_current_unfinished_run_uses_live_scheduler_state() {
    let dir = tempfile::tempdir().unwrap();
    for id in ["old", "current"] {
        let run = dir.path().join("runs").join(id);
        fs::create_dir_all(&run).unwrap();
        fs::write(run.join("started"), "2026-10-27T01:00:00Z").unwrap();
    }
    fs::write(dir.path().join("current-run"), "current").unwrap();
    let history = native_history(dir.path(), || true).unwrap();
    assert_eq!(history.runs[0].id, "current");
    assert_eq!(history.runs[0].status, "running");
    assert_eq!(history.runs[1].status, "unknown");
}

#[test]
fn legacy_records_remain_readable_and_unfinished_runs_are_not_successes() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("started"), "2026-10-27T01:00:00Z").unwrap();
    fs::write(dir.path().join("exit"), "0").unwrap();
    assert_eq!(
        native_history(dir.path(), || false).unwrap().runs[0].status,
        "completed"
    );
    for (id, exit) in [("first", Some("7")), ("second", None)] {
        let path = dir.path().join("runs").join(id);
        fs::create_dir_all(&path).unwrap();
        fs::write(path.join("started"), "2026-10-27T02:00:00Z").unwrap();
        if let Some(exit) = exit {
            fs::write(path.join("exit"), exit).unwrap();
        }
    }
    fs::write(dir.path().join("current-run"), "second").unwrap();
    let runs = native_history(dir.path(), || true).unwrap().runs;
    assert_eq!(runs[0].id, "second");
    assert_eq!(runs[0].status, "running");
    assert_eq!(runs[1].exit_code, Some(7));
    assert_eq!(
        native_history(dir.path(), || false).unwrap().runs[0].status,
        "unknown"
    );
    assert!(!component("../escape"));
}
#[cfg(unix)]
#[test]
fn refuses_linked_history_directories() {
    let dir = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::os::unix::fs::symlink(outside.path(), dir.path().join("runs")).unwrap();
    assert!(native_history(dir.path(), || false).is_err());
}
