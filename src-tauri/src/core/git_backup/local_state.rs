//! Root-only exclusions: never mistake a Skill's own fixtures for app state.
use super::*;
pub(super) const PATTERNS: &[&str] = &[
    "/agent-hub.db",
    "/agent-hub.db-wal",
    "/agent-hub.db-shm",
    "/repo-config.json",
    "/library.lock",
    "/shared-skills-layout.json",
    "/shared-skills-migration.json",
    "/logs/",
    "/cache/",
    "/recovery/",
    "/.secret.key",
    "/.skill-lock.json",
];

pub(super) fn untrack(root: &Path) -> Result<()> {
    // Existing accidental inclusions must leave the index too; keep disk files.
    let tracked = run_git(root, &["ls-files", "-z"])?;
    let paths: Vec<_> = tracked
        .split('\0')
        .filter(|path| {
            PATTERNS.iter().any(|pattern| {
                let pattern = pattern.trim_start_matches('/');
                if pattern.ends_with('/') {
                    path.starts_with(pattern)
                } else {
                    *path == pattern
                }
            })
        })
        .collect();
    for path in paths {
        run_git_checked(
            root,
            &[
                "rm",
                "--cached",
                "--ignore-unmatch",
                "--",
                &format!(":(literal){path}"),
            ],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn backup_excludes_root_app_state_but_keeps_skill_fixtures_and_portable_metadata() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        fs::create_dir_all(root.join("demo/logs")).unwrap();
        fs::create_dir_all(root.join("logs")).unwrap();
        fs::create_dir_all(root.join(".agent-hub/skills")).unwrap();
        for path in [
            "agent-hub.db",
            "logs/debug.log",
            "repo-config.json",
            ".skill-lock.json",
            "demo/agent-hub.db",
            "demo/logs/fixture.log",
            ".agent-hub/skills/demo.json",
        ] {
            fs::write(root.join(path), "fixture").unwrap();
        }
        run_git_checked(root, &["init"]).unwrap();
        run_git_checked(root, &["add", "-A"]).unwrap();
        ensure_gitignore(root).unwrap();
        run_git_checked(root, &["add", "-A"]).unwrap();
        let tracked = run_git(root, &["ls-files"]).unwrap();
        for path in [
            "agent-hub.db",
            "logs/debug.log",
            "repo-config.json",
            ".skill-lock.json",
        ] {
            assert!(!tracked.lines().any(|line| line == path), "{path}");
            assert!(root.join(path).is_file());
        }
        for path in [
            "demo/agent-hub.db",
            "demo/logs/fixture.log",
            ".agent-hub/skills/demo.json",
        ] {
            assert!(tracked.lines().any(|line| line == path), "{path}");
        }
        let first = fs::read(root.join(".gitignore")).unwrap();
        ensure_gitignore(root).unwrap();
        assert_eq!(fs::read(root.join(".gitignore")).unwrap(), first);
    }
}
