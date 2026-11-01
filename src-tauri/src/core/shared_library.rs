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
        fs::create_dir_all(shared)?;
        return save(home, &Layout::default());
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
mod tests;
