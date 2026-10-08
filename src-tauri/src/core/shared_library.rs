//! Default shared Skills storage. Application state stays in the application home.
//! The old tree is retained until the user removes it; copies never overwrite
//! existing shared content. A durable marker switches readers only after copying.
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

const JOURNAL: &str = "shared-skills-migration.json";
const MARKER: &str = "shared-skills-layout.json";

#[derive(Default, Serialize, Deserialize)]
struct Layout {
    repoint_from: Option<PathBuf>,
}

fn marker(home: &Path) -> PathBuf {
    home.join(MARKER)
}

pub(super) fn activated(home: &Path) -> bool {
    marker(home).is_file()
}

pub(super) fn active_root(home: &Path, legacy: &Path, shared: &Path) -> PathBuf {
    if activated(home) || !legacy.exists() {
        shared.into()
    } else {
        legacy.into()
    }
}

fn save(home: &Path, layout: &Layout) -> Result<()> {
    fs::create_dir_all(home)?;
    let mut file = tempfile::NamedTempFile::new_in(home)?;
    file.write_all(&serde_json::to_vec_pretty(layout)?)?;
    file.as_file().sync_all()?;
    file.persist(marker(home))?;
    Ok(())
}

pub(super) fn pending_repoint(home: &Path) -> Result<Option<PathBuf>> {
    if !activated(home) {
        return Ok(None);
    }
    let layout: Layout = serde_json::from_slice(&fs::read(marker(home))?)?;
    Ok(layout.repoint_from)
}

pub(super) fn finish_repoint(home: &Path) -> Result<()> {
    save(home, &Layout::default())
}

/// Run while holding the exclusive application library lease. Shared contents
/// may belong to another installer, so collisions are checked before copying.
pub(super) fn migrate(home: &Path, legacy: &Path, shared: &Path) -> Result<()> {
    if activated(home) {
        pending_repoint(home)?;
        return Ok(());
    }
    if legacy == shared {
        bail!("Shared and legacy Skills roots must differ");
    }
    if !legacy.exists() {
        fs::create_dir_all(shared)?;
        return save(home, &Layout::default());
    }
    if legacy.is_symlink() || shared.is_symlink() {
        bail!("Resolve linked Skills roots before changing the default library");
    }
    if legacy
        .join(".git")
        .symlink_metadata()
        .is_ok_and(|meta| !meta.is_dir() || meta.file_type().is_symlink())
    {
        bail!("Linked Git metadata must be converted to a standalone repository before migration");
    }
    if legacy.join(".agent-hub").exists()
        && shared.join(".agent-hub").exists()
        && !home.join(JOURNAL).exists()
    {
        bail!("Shared Skills already contain independent AgentHub metadata");
    }
    // Independent Git histories must never be combined by copying .git files.
    if legacy.join(".git").exists() && shared.join(".git").exists() && !home.join(JOURNAL).exists()
    {
        bail!("The shared Skills directory already has its own Git repository");
    }
    if home.join(JOURNAL).exists() {
        let recorded: (PathBuf, PathBuf) = serde_json::from_slice(&fs::read(home.join(JOURNAL))?)?;
        if recorded != (legacy.into(), shared.into()) {
            bail!("Shared migration journal does not match current roots");
        }
    }
    super::sync_engine::ensure_dst_not_inside_src(legacy, shared)?;
    validate_copy(legacy, shared)?;
    fs::create_dir_all(home)?;
    if !home.join(JOURNAL).exists() {
        let mut journal = tempfile::NamedTempFile::new_in(home)?;
        journal.write_all(&serde_json::to_vec(&(legacy, shared))?)?;
        journal.as_file().sync_all()?;
        journal.persist_noclobber(home.join(JOURNAL))?;
    }
    copy_missing(legacy, shared)?;
    save(
        home,
        &Layout {
            repoint_from: Some(legacy.into()),
        },
    )?;
    fs::remove_file(home.join(JOURNAL))?;
    Ok(())
}

fn validate_copy(source: &Path, target: &Path) -> Result<()> {
    let src = source.symlink_metadata()?;
    let dst = match target.symlink_metadata() {
        Ok(meta) => meta,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(err) => return Err(err.into()),
    };
    if dst.file_type().is_symlink() && target.canonicalize().ok() == Some(source.canonicalize()?) {
        return Ok(());
    }
    if src.is_dir() && dst.is_dir() && !dst.file_type().is_symlink() {
        for entry in fs::read_dir(source)? {
            let entry = entry?;
            validate_copy(&entry.path(), &target.join(entry.file_name()))?;
        }
        return Ok(());
    }
    if src.is_file()
        && dst.is_file()
        && !dst.file_type().is_symlink()
        && fs::read(source)? == fs::read(target)?
    {
        return Ok(());
    }
    if src.file_type().is_symlink()
        && dst.file_type().is_symlink()
        && link_target(source)? == link_target(target)?
    {
        return Ok(());
    }
    bail!(
        "Shared Skills destination contains different content: {}",
        target.display()
    )
}

fn link_target(path: &Path) -> Result<PathBuf> {
    let link = fs::read_link(path)?;
    Ok(if link.is_absolute() {
        link
    } else {
        path.parent().context("Link without parent")?.join(link)
    })
}

fn copy_missing(source: &Path, target: &Path) -> Result<()> {
    let meta = source.symlink_metadata()?;
    if target.is_symlink() && target.canonicalize().ok() == Some(source.canonicalize()?) {
        super::sync_engine::remove_link(target)?;
    }
    if meta.is_dir() && !meta.file_type().is_symlink() {
        match fs::create_dir(target) {
            Ok(()) => {}
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => {
                let dest = target.symlink_metadata()?;
                if !dest.is_dir() || dest.file_type().is_symlink() {
                    bail!("Migration destination changed");
                }
            }
            Err(err) => return Err(err.into()),
        }
        for entry in fs::read_dir(source)? {
            let entry = entry?;
            copy_missing(&entry.path(), &target.join(entry.file_name()))?;
        }
    } else if target.symlink_metadata().is_ok() {
        validate_copy(source, target)?;
    } else if meta.file_type().is_symlink() {
        let pointee = link_target(source)?;
        #[cfg(unix)]
        std::os::unix::fs::symlink(pointee, target)?;
        #[cfg(windows)]
        if source.is_dir() {
            std::os::windows::fs::symlink_dir(pointee, target)?;
        } else {
            std::os::windows::fs::symlink_file(pointee, target)?;
        }
    } else if meta.is_file() {
        let mut file =
            tempfile::NamedTempFile::new_in(target.parent().context("Missing target parent")?)?;
        std::io::copy(&mut fs::File::open(source)?, &mut file)?;
        file.as_file().set_permissions(meta.permissions())?;
        file.as_file().sync_all()?;
        file.persist_noclobber(target)?;
    } else {
        bail!("Unsupported entry in the old Skills library");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, PathBuf, PathBuf, PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("app");
        let legacy = home.join("skills");
        let shared = temp.path().join("agents/skills");
        fs::create_dir_all(legacy.join("demo")).unwrap();
        fs::create_dir_all(shared.parent().unwrap()).unwrap();
        fs::write(legacy.join("demo/SKILL.md"), "# Demo").unwrap();
        fs::write(home.join("agent-hub.db"), "database fixture").unwrap();
        (temp, home, legacy, shared)
    }

    #[test]
    fn merges_without_overwrite_keeps_state_and_old_contents() {
        let (_temp, home, legacy, shared) = fixture();
        fs::create_dir_all(shared.join("external")).unwrap();
        fs::write(shared.join("external/SKILL.md"), "# External").unwrap();
        assert_eq!(active_root(&home, &legacy, &shared), legacy);
        migrate(&home, &legacy, &shared).unwrap();
        assert_eq!(active_root(&home, &legacy, &shared), shared);
        assert_eq!(pending_repoint(&home).unwrap(), Some(legacy.clone()));
        assert!(shared.join("demo/SKILL.md").is_file());
        assert!(shared.join("external/SKILL.md").is_file());
        assert!(legacy.join("demo/SKILL.md").is_file());
        assert!(!shared.join("agent-hub.db").exists());
        finish_repoint(&home).unwrap();
        migrate(&home, &legacy, &shared).unwrap();
        assert!(pending_repoint(&home).unwrap().is_none());
    }

    #[test]
    fn conflict_keeps_old_root_and_all_existing_bytes() {
        let (_temp, home, legacy, shared) = fixture();
        fs::create_dir_all(shared.join("demo")).unwrap();
        fs::write(shared.join("demo/SKILL.md"), "# Different").unwrap();
        assert!(migrate(&home, &legacy, &shared).is_err());
        assert_eq!(active_root(&home, &legacy, &shared), legacy);
        assert_eq!(
            fs::read_to_string(shared.join("demo/SKILL.md")).unwrap(),
            "# Different"
        );
        assert!(!home.join(JOURNAL).exists());
    }

    #[test]
    fn preserves_git_history_remote_and_can_commit_after_migration() {
        let (_temp, home, legacy, shared) = fixture();
        crate::core::git_backup::init_repo_unlocked(&legacy, "Fixture").unwrap();
        let repo = git2::Repository::open(&legacy).unwrap();
        repo.remote("origin", "https://example.invalid/skills.git")
            .unwrap();
        let before = repo.head().unwrap().target();
        drop(repo);
        migrate(&home, &legacy, &shared).unwrap();
        let repo = git2::Repository::open(&shared).unwrap();
        assert_eq!(repo.head().unwrap().target(), before);
        assert_eq!(
            repo.find_remote("origin").unwrap().url(),
            Some("https://example.invalid/skills.git")
        );
        fs::write(shared.join("demo/SKILL.md"), "# Updated").unwrap();
        crate::core::git_backup::commit_all_unlocked(&shared, "update fixture").unwrap();
        assert_ne!(repo.head().unwrap().target(), before);
        assert_eq!(
            git2::Repository::open(&legacy)
                .unwrap()
                .head()
                .unwrap()
                .target(),
            before
        );
    }

    #[test]
    fn retries_interrupted_copy_but_refuses_independent_git_history() {
        let (_temp, home, legacy, shared) = fixture();
        fs::create_dir_all(legacy.join(".git")).unwrap();
        fs::write(legacy.join(".git/HEAD"), "ref: refs/heads/main\n").unwrap();
        fs::create_dir_all(shared.join(".git")).unwrap();
        fs::write(shared.join(".git/HEAD"), "ref: refs/heads/main\n").unwrap();
        assert!(migrate(&home, &legacy, &shared).is_err());
        fs::write(
            home.join(JOURNAL),
            serde_json::to_vec(&(&legacy, &shared)).unwrap(),
        )
        .unwrap();
        migrate(&home, &legacy, &shared).unwrap();
        assert!(activated(&home));
        assert!(!home.join(JOURNAL).exists());
        assert!(shared.join("demo/SKILL.md").exists());
    }

    #[cfg(unix)]
    #[test]
    fn replaces_only_links_to_old_library_and_preserves_external_links() {
        let (temp, home, legacy, shared) = fixture();
        fs::create_dir_all(&shared).unwrap();
        std::os::unix::fs::symlink(legacy.join("demo"), shared.join("demo")).unwrap();
        let external = temp.path().join("external");
        fs::create_dir_all(&external).unwrap();
        fs::write(external.join("SKILL.md"), "# External").unwrap();
        std::os::unix::fs::symlink(&external, shared.join("external")).unwrap();
        migrate(&home, &legacy, &shared).unwrap();
        assert!(!shared.join("demo").is_symlink());
        assert!(shared.join("demo/SKILL.md").is_file());
        assert!(shared.join("external").is_symlink());
        assert!(legacy.join("demo/SKILL.md").is_file());
    }
}
