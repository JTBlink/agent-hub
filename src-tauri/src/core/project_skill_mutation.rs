//! Serializes project writes whose Agent paths may alias the same directory.

use std::sync::{Mutex, MutexGuard};

use super::error::AppError;

// Hold across scanning/checking, removal, writing and cleanup. Commands acquire
// this on spawn_blocking workers before taking any short-lived store locks.
static PROJECT_SKILL_LOCK: Mutex<()> = Mutex::new(());

pub(crate) fn lock_project_skill_mutation() -> Result<MutexGuard<'static, ()>, AppError> {
    PROJECT_SKILL_LOCK.lock().map_err(|_| {
        AppError::internal("Project skill operation lock is unavailable; restart the application")
    })
}

#[cfg(all(test, unix))]
mod tests {
    use super::lock_project_skill_mutation;
    use crate::core::sync_engine::{sync_skill, ReplacePolicy, SyncMode};
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn concurrent_project_updates_through_agent_aliases_preserve_complete_content() {
        use std::os::unix::fs::symlink;
        use std::sync::Barrier;

        let tmp = tempdir().unwrap();
        let source = tmp.path().join("center/demo");
        let shared = tmp.path().join("project/.agents/skills");
        let alias = tmp.path().join("project/.claude/skills");
        fs::create_dir_all(source.join("scripts")).unwrap();
        fs::write(source.join("SKILL.md"), "# Updated\n").unwrap();
        fs::write(source.join("scripts/run.sh"), "echo demo\n").unwrap();
        fs::create_dir_all(shared.join("demo")).unwrap();
        fs::write(shared.join("demo/SKILL.md"), "# Old\n").unwrap();
        fs::create_dir_all(alias.parent().unwrap()).unwrap();
        symlink(&shared, &alias).unwrap();

        for mode in [SyncMode::Copy, SyncMode::Symlink] {
            for _ in 0..20 {
                let barrier = Barrier::new(8);
                std::thread::scope(|scope| {
                    let mut handles = Vec::new();
                    for index in 0..8 {
                        let root = if index % 2 == 0 { &shared } else { &alias };
                        let source = &source;
                        let barrier = &barrier;
                        handles.push(scope.spawn(move || {
                            barrier.wait();
                            let _guard = lock_project_skill_mutation().unwrap();
                            sync_skill(
                                source,
                                &root.join("demo"),
                                mode,
                                ReplacePolicy::UserConfirmed,
                            )
                        }));
                    }
                    for handle in handles {
                        handle.join().unwrap().unwrap();
                    }
                });
                assert_eq!(
                    fs::read_to_string(shared.join("demo/SKILL.md")).unwrap(),
                    "# Updated\n"
                );
                assert_eq!(
                    fs::read_to_string(alias.join("demo/scripts/run.sh")).unwrap(),
                    "echo demo\n"
                );
                assert_eq!(
                    fs::read_to_string(source.join("SKILL.md")).unwrap(),
                    "# Updated\n"
                );
            }
        }
    }
}
