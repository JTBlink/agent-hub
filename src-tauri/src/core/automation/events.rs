//! Invalidate automation views on real definition/start/completion changes.
//! Script edits update portable definitions; runtime output stays local.
use super::{hermes, native, store, AutomationOverview, Provider};
use crate::core::path_guard::is_path_safe;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
use tauri::Emitter;

const EVENT: &str = "automations-changed";

fn paths(root: &Path) -> HashSet<PathBuf> {
    let mut paths = HashSet::from([root.to_path_buf()]);
    if let Ok(records) = store::load(root) {
        for record in records
            .into_iter()
            .filter(|r| r.draft.provider == Provider::System)
        {
            let dir = native::directory(root, &record);
            if is_path_safe(root, &dir) {
                paths.insert(dir);
                if let Some(workdir) = record.draft.workdir {
                    for file in &record.draft.files {
                        if let Some(parent) = Path::new(&workdir).join(&file.path).parent() {
                            if is_path_safe(Path::new(&workdir), parent) && !parent.is_symlink() {
                                paths.insert(parent.to_path_buf());
                            }
                        }
                    }
                    paths.insert(PathBuf::from(workdir));
                }
            }
        }
    }
    let mut report = AutomationOverview::default();
    hermes::collect(&mut report);
    for task in report.tasks {
        if let Some(dir) = Path::new(&task.location).parent() {
            paths.insert(dir.to_path_buf());
        }
    }
    paths
        .into_iter()
        .filter_map(|path| path.canonicalize().ok())
        .filter(|path| path.is_dir())
        .collect()
}
fn relevant(event: &Event, root: &Path, watched: &HashSet<PathBuf>) -> bool {
    if matches!(event.kind, EventKind::Access(_)) {
        return false;
    }
    event.paths.iter().any(|path| {
        let Some(parent) = path.parent() else {
            return false;
        };
        if !watched.contains(parent) {
            return false;
        }
        match path.file_name().and_then(|name| name.to_str()) {
            Some("tasks.json") => parent == root,
            Some("started" | "exit") => parent.parent() == Some(root),
            Some("jobs.json") => parent != root,
            Some(name)
                if [".py", ".sh", ".ps1", ".json", ".md"]
                    .iter()
                    .any(|extension| name.ends_with(extension)) =>
            {
                true
            }
            _ => false,
        }
    })
}

pub(crate) fn start<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = match RecommendedWatcher::new(
            move |event| {
                let _ = tx.send(event);
            },
            notify::Config::default(),
        ) {
            Ok(watcher) => watcher,
            Err(error) => {
                log::warn!("Cannot observe automation changes: {error}");
                return;
            }
        };
        let root = store::root();
        let root = root.canonicalize().unwrap_or(root);
        if let Err(error) = super::sync_workspace_scripts() {
            log::warn!("Cannot synchronize automation scripts: {error}");
        }
        super::managed::upgrade_runners();
        let mut watched = HashSet::new();
        let mut rescan_at = Instant::now();
        let mut changed_at = None;
        let mut initialized = false;
        loop {
            if Instant::now() >= rescan_at {
                let desired = paths(&root);
                let previous = watched.clone();
                for path in watched.difference(&desired) {
                    let _ = watcher.unwatch(path);
                }
                watched.retain(|path| desired.contains(path));
                for path in desired.difference(&watched).cloned().collect::<Vec<_>>() {
                    if watcher.watch(&path, RecursiveMode::NonRecursive).is_ok() {
                        watched.insert(path);
                    }
                }
                if initialized && watched != previous {
                    changed_at = Some(Instant::now());
                }
                initialized = true;
                // Discover new task directories without querying schedulers or repainting UI.
                rescan_at = Instant::now() + Duration::from_secs(10);
            }
            match rx.recv_timeout(Duration::from_millis(100)) {
                Ok(Ok(event)) if relevant(&event, &root, &watched) => {
                    changed_at = Some(Instant::now());
                    rescan_at = Instant::now();
                }
                Ok(Err(error)) => log::debug!("Automation observation failed: {error}"),
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                _ => {}
            }
            // Coalesce marker writes and allow the short-lived wrapper to exit.
            if changed_at.is_some_and(|at| at.elapsed() >= Duration::from_millis(400)) {
                changed_at = None;
                if let Err(error) = super::sync_workspace_scripts() {
                    log::warn!("Cannot synchronize automation scripts: {error}");
                }
                super::managed::upgrade_runners();
                let _ = app.emit(EVENT, ());
            }
        }
    });
}

#[cfg(test)]
mod tests {
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
            &Event::new(EventKind::Access(notify::event::AccessKind::Any))
                .add_path(task.join("exit")),
            root,
            &watched
        ));
    }
}
