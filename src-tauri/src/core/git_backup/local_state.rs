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
    "/credentials/",
    "/backup/",
    "/backup-publication.json",
    "/backup-publication.tmp",
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
mod tests;
