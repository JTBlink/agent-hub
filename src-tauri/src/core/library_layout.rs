//! Promote the old default library into its parent without overwriting any data.
//! Callers must hold the lifetime library lease exclusively before moving files.
use anyhow::{bail, Context, Result};
use std::{
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
};

const JOURNAL: &str = ".library-flatten.json";

pub(super) fn interrupted(target: &Path) -> bool {
    target.join(JOURNAL).exists()
}

pub(super) fn legacy_exists(root: &Path) -> bool {
    let old = root.join("library");
    old.join("agent-hub.db").is_file() || old.join("skills").is_dir()
}

fn load_plan(target: &Path) -> Result<Vec<PathBuf>> {
    let plan: Vec<PathBuf> = serde_json::from_slice(&fs::read(target.join(JOURNAL))?)?;
    for name in &plan {
        if name.components().count() != 1
            || !matches!(name.components().next(), Some(Component::Normal(_)))
            || name == Path::new("library")
            || name == Path::new(JOURNAL)
            || name == Path::new("repo-config.json")
            || name == Path::new("library.lock")
        {
            bail!("Invalid library migration journal entry");
        }
    }
    Ok(plan)
}

fn exists(path: &Path) -> bool {
    path.symlink_metadata().is_ok()
}

/// Restore a partial move before opening any database. A crash midway through
/// rollback can be retried using the same journal; originals always take priority.
fn rollback(source: &Path, target: &Path, plan: &[PathBuf]) -> Result<()> {
    for name in plan.iter().rev() {
        let from = source.join(name);
        let to = target.join(name);
        if !exists(&from) && exists(&to) {
            fs::rename(&to, &from).context("Cannot roll back interrupted library migration")?;
        }
    }
    fs::remove_file(target.join(JOURNAL))?;
    Ok(())
}

pub(super) fn flatten(source: &Path, target: &Path) -> Result<()> {
    if source != target.join("library") {
        anyhow::bail!("Invalid old default location");
    }
    if !source.exists() && interrupted(target) {
        let plan = load_plan(target)?;
        if !plan.iter().all(|name| exists(&target.join(name))) {
            bail!("Incomplete library migration with missing source");
        }
        fs::remove_file(target.join(JOURNAL))?;
        return Ok(());
    }
    if source.symlink_metadata()?.file_type().is_symlink() {
        bail!("Only the real default library directory can be promoted");
    }
    if interrupted(target) {
        let plan = load_plan(target)?;
        rollback(source, target, &plan)?;
    }
    let plan: Vec<PathBuf> = fs::read_dir(source)?
        .map(|entry| entry.map(|entry| PathBuf::from(entry.file_name())))
        .collect::<std::io::Result<_>>()?;
    let plan: Vec<_> = plan
        .into_iter()
        .filter(|name| name != Path::new(".DS_Store"))
        .collect();
    // Check every collision before moving the first entry. Fixed app files,
    // configured destinations and existing skills remain untouched.
    for name in &plan {
        if exists(&target.join(name)) {
            bail!(
                "Library migration destination already contains {}",
                name.display()
            );
        }
        if name == Path::new("library") || name == Path::new(JOURNAL) {
            bail!("Reserved entry in old library");
        }
    }
    // Write and sync before publishing the journal, so a terminated process
    // cannot leave a half-written recovery plan behind.
    let mut journal = tempfile::NamedTempFile::new_in(target)?;
    journal.write_all(&serde_json::to_vec(&plan)?)?;
    journal.as_file().sync_all()?;
    journal.persist_noclobber(target.join(JOURNAL))?;
    for name in &plan {
        let to = target.join(name);
        let result = if exists(&to) {
            Err(std::io::Error::new(
                std::io::ErrorKind::AlreadyExists,
                "Migration destination changed",
            ))
        } else {
            fs::rename(source.join(name), &to)
        };
        if let Err(error) = result {
            rollback(source, target, &plan)?;
            return Err(error).context("Cannot promote old library; original data restored");
        }
    }
    // Removing the empty source makes a completed move recognizable even if
    // the process stops before the config's repoint marker is saved.
    if source.join(".DS_Store").is_file() {
        fs::remove_file(source.join(".DS_Store"))?;
    }
    fs::remove_dir(source)?;
    fs::remove_file(target.join(JOURNAL))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(root: &Path) -> PathBuf {
        let old = root.join("library");
        fs::create_dir_all(old.join("skills/demo")).unwrap();
        fs::write(old.join("skills/demo/SKILL.md"), "# Demo").unwrap();
        fs::write(old.join("agent-hub.db"), "database fixture").unwrap();
        fs::write(old.join("agent-hub.db-wal"), "wal fixture").unwrap();
        fs::write(old.join(".secret.key"), "fixture key").unwrap();
        old
    }
    #[test]
    fn promotes_complete_library_and_preserves_fixed_app_state() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let old = fixture(root);
        fs::write(root.join(".DS_Store"), "keep metadata").unwrap();
        fs::write(old.join(".DS_Store"), "old metadata").unwrap();
        fs::create_dir_all(root.join("bin")).unwrap();
        fs::write(root.join("repo-config.json"), "config fixture").unwrap();
        flatten(&old, root).unwrap();
        assert!(!old.exists());
        assert!(!interrupted(root));
        for (name, value) in [
            ("skills/demo/SKILL.md", "# Demo"),
            ("agent-hub.db", "database fixture"),
            ("agent-hub.db-wal", "wal fixture"),
            (".secret.key", "fixture key"),
            ("repo-config.json", "config fixture"),
        ] {
            assert_eq!(fs::read_to_string(root.join(name)).unwrap(), value);
        }
        assert!(root.join("bin").is_dir());
    }
    #[test]
    fn collision_leaves_entire_original_library_and_destination_intact() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let old = fixture(root);
        fs::create_dir_all(root.join("skills")).unwrap();
        fs::write(root.join("skills/local"), "keep").unwrap();
        assert!(flatten(&old, root).is_err());
        assert_eq!(
            fs::read_to_string(old.join("agent-hub.db")).unwrap(),
            "database fixture"
        );
        assert_eq!(
            fs::read_to_string(root.join("skills/local")).unwrap(),
            "keep"
        );
        assert!(!interrupted(root));
    }
    #[test]
    fn interrupted_move_is_restored_and_retried() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let old = fixture(root);
        let plan = vec![
            PathBuf::from("skills"),
            PathBuf::from("agent-hub.db"),
            PathBuf::from("agent-hub.db-wal"),
            PathBuf::from(".secret.key"),
        ];
        fs::write(root.join(JOURNAL), serde_json::to_vec(&plan).unwrap()).unwrap();
        fs::rename(old.join("agent-hub.db"), root.join("agent-hub.db")).unwrap();
        flatten(&old, root).unwrap();
        assert_eq!(
            fs::read_to_string(root.join("agent-hub.db")).unwrap(),
            "database fixture"
        );
        assert!(root.join("skills/demo/SKILL.md").is_file());
        assert!(!old.exists());
    }
    #[test]
    fn invalid_journal_never_moves_paths_outside_library() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let old = fixture(root);
        fs::write(root.join(JOURNAL), r#"["../outside"]"#).unwrap();
        assert!(flatten(&old, root).is_err());
        assert!(old.join("agent-hub.db").is_file());
    }
    #[test]
    fn completed_move_with_remaining_journal_recovers_after_source_removed() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let old = fixture(root);
        let plan: Vec<PathBuf> = fs::read_dir(&old)
            .unwrap()
            .map(|entry| PathBuf::from(entry.unwrap().file_name()))
            .collect();
        fs::write(root.join(JOURNAL), serde_json::to_vec(&plan).unwrap()).unwrap();
        for name in &plan {
            fs::rename(old.join(name), root.join(name)).unwrap();
        }
        fs::remove_dir(&old).unwrap();
        flatten(&old, root).unwrap();
        assert!(!interrupted(root));
        assert!(root.join("skills/demo/SKILL.md").exists());
    }
}
