use super::*;
#[test]
fn only_definition_and_run_lifecycle_events_invalidate_the_view() {
    let root = Path::new("/automation");
    let task = root.join("example");
    let hermes = PathBuf::from("/hermes/cron");
    let watched = HashSet::from([root.to_path_buf(), task.clone(), hermes.clone()]);
    let event = |path: PathBuf| {
        Event::new(EventKind::Modify(notify::event::ModifyKind::Any)).add_path(path)
    };
    for path in [
        root.join("tasks.json"),
        task.join("started"),
        task.join("exit"),
        hermes.join("jobs.json"),
        task.join("agent-hub-11111111-1111-4111-8111-111111111111.sh"),
        task.join("agent-hub-11111111-1111-4111-8111-111111111111.ps1"),
        task.join("disk-cleanup.py"),
        task.join("cleanup-config.json"),
        task.join("README.md"),
        task.join("run.sh"),
        task.join("run-2.ps1"),
    ] {
        assert!(relevant(&event(path), root, &watched));
    }
    for path in [
        task.join("output.log"),
        task.join("workspace/artifact"),
        root.join(".lock"),
        PathBuf::from("/outside/jobs.json"),
    ] {
        assert!(!relevant(&event(path), root, &watched));
    }
    assert!(!relevant(
        &Event::new(EventKind::Access(notify::event::AccessKind::Any)).add_path(task.join("exit")),
        root,
        &watched
    ));
}
