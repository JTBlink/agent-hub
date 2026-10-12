//! Recoverable publication of project content and its portable manifest.
use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{bail, Context, Result};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{
    entries::{self, fingerprint_entry},
    manifest::fingerprint,
    safe_path,
};

pub struct ProjectLock {
    _file: fs::File,
    pub journal: PathBuf,
}

impl ProjectLock {
    pub fn acquire(root: &Path) -> Result<Self> {
        let key = format!("{:x}", Sha256::digest(root.to_string_lossy().as_bytes()));
        let directory = crate::core::central_repo::base_dir().join("project-transactions");
        fs::create_dir_all(&directory)?;
        let file = fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(directory.join(format!("{key}.lock")))?;
        file.try_lock_exclusive()
            .context("Project Skills are busy; retry after the current operation")?;
        Ok(Self {
            _file: file,
            journal: directory.join(format!("{key}.json")),
        })
    }
}

#[derive(Serialize, Deserialize)]
struct Journal {
    root: PathBuf,
    staging: PathBuf,
    items: Vec<Item>,
    committed: bool,
    #[serde(default)]
    reads: Vec<(String, Option<String>)>,
}

#[derive(Serialize, Deserialize)]
struct Item {
    relative: String,
    before: Option<String>,
    after: Option<String>,
}

pub struct Publication {
    directory: tempfile::TempDir,
    items: Vec<Item>,
    reads: Vec<(String, Option<String>)>,
}

impl Publication {
    pub fn new(root: &Path) -> Result<Self> {
        Ok(Self {
            directory: tempfile::Builder::new()
                .prefix(".agent-hub-transaction-")
                .tempdir_in(root)?,
            items: Vec::new(),
            reads: Vec::new(),
        })
    }

    pub fn observe(&mut self, relative: String, expected: Option<String>) {
        self.reads.push((relative, expected));
    }

    pub fn staged(&self, index: usize) -> PathBuf {
        self.directory.path().join(format!("new-{index}"))
    }

    pub fn add(
        &mut self,
        root: &Path,
        relative: String,
        source: Option<&Path>,
        baseline: Option<&str>,
    ) -> Result<()> {
        if self.items.iter().any(|item| item.relative == relative) {
            bail!("Duplicate project publication target");
        }
        let target = entries::path(root, &relative)?;
        for item in &self.items {
            crate::core::path_guard::ensure_disjoint_paths(
                &target,
                &entries::path(root, &item.relative)?,
            )
            .map_err(|err| anyhow::anyhow!(err.message))?;
        }
        let staged = self.staged(self.items.len());
        if let Some(source) = source {
            if source.is_symlink() {
                entries::create_link(&fs::read_link(source)?, &staged)?;
            } else if source.is_dir() {
                copy_project_content(source, &staged)?;
            } else {
                fs::copy(source, &staged)?;
            }
        }
        let before = fingerprint_entry(&target)?;
        let after = fingerprint_entry(&staged)?;
        let matches_baseline = before.as_deref() == baseline
            || (target.is_symlink()
                && entries::content_fingerprint(root, &relative)
                    .is_ok_and(|current| current.as_deref() == baseline));
        if before.is_some() && !matches_baseline && before != after {
            bail!("Project changed while staging; existing files were preserved: {relative}");
        }
        self.items.push(Item {
            relative,
            before,
            after,
        });
        Ok(())
    }

    /// Stage a relative link, with a content-copy fallback when unsupported.
    pub fn add_link(
        &mut self,
        root: &Path,
        relative: String,
        canonical: &str,
        content: &Path,
        baseline: Option<&str>,
    ) -> Result<bool> {
        let target = entries::project_link_target(&relative, canonical)?;
        let link = self
            .directory
            .path()
            .join(format!("link-{}", self.items.len()));
        let linked = match entries::create_link(&target, &link) {
            Ok(()) => true,
            Err(error) => {
                log::warn!(
                    "Unable to create project Skill link for {relative}; using a copy: {error}"
                );
                false
            }
        };
        self.add(
            root,
            relative,
            Some(if linked { &link } else { content }),
            baseline,
        )?;
        Ok(linked)
    }

    pub fn apply(self, root: &Path, lock: &ProjectLock) -> Result<()> {
        for item in &self.items {
            if fingerprint_entry(&entries::path(root, &item.relative)?)? != item.before {
                bail!("Project changed after preview; retry without overwriting it");
            }
        }
        let journal = Journal {
            root: root.into(),
            staging: self.directory.keep(),
            items: self.items,
            committed: false,
            reads: self.reads,
        };
        write_journal(&lock.journal, &journal)?;
        let result = publish(&journal);
        if let Err(error) = result {
            recover(root, lock)
                .context("Publication failed and recovery needs attention; originals retained")?;
            return Err(error);
        }
        let journal = Journal {
            committed: true,
            ..journal
        };
        write_journal(&lock.journal, &journal)?;
        recover(root, lock)
    }
}

fn write_journal(path: &Path, journal: &Journal) -> Result<()> {
    use std::io::Write;
    let mut file =
        tempfile::NamedTempFile::new_in(path.parent().context("Missing journal parent")?)?;
    file.write_all(&serde_json::to_vec_pretty(journal)?)?;
    file.as_file().sync_all()?;
    file.persist(path)?;
    Ok(())
}

#[cfg(test)]
thread_local! {
    pub(super) static FAIL_AFTER: std::cell::Cell<Option<usize>> = const { std::cell::Cell::new(None) };
}

fn publish(journal: &Journal) -> Result<()> {
    for (index, item) in journal.items.iter().enumerate() {
        #[cfg(test)]
        if FAIL_AFTER.with(|value| value.get()) == Some(index) {
            bail!("Injected publication failure");
        }
        check_reads(journal)?;
        let target = entries::path(&journal.root, &item.relative)?;
        if fingerprint_entry(&target)? != item.before {
            bail!(
                "Project changed during publication; refusing to overwrite {}",
                item.relative
            );
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        if item.before.is_some() {
            fs::rename(&target, journal.staging.join(format!("old-{index}")))?;
        }
        if item.after.is_some() {
            fs::rename(journal.staging.join(format!("new-{index}")), &target)?;
        }
    }
    check_reads(journal)
}

fn check_reads(journal: &Journal) -> Result<()> {
    for (relative, expected) in &journal.reads {
        if fingerprint(&safe_path(&journal.root, relative)?)? != *expected {
            bail!("Project source changed during publication; retry without overwriting it");
        }
    }
    Ok(())
}

/// Called before every mutation; a crash is rolled back without replacing
/// external edits. On conflict the journal and originals remain for recovery.
pub fn recover(root: &Path, lock: &ProjectLock) -> Result<()> {
    if !lock.journal.exists() {
        return Ok(());
    }
    let journal: Journal = serde_json::from_slice(&fs::read(&lock.journal)?)?;
    if journal.root != root
        || journal.staging.parent() != Some(root)
        || !journal.staging.file_name().is_some_and(|name| {
            name.to_string_lossy()
                .starts_with(".agent-hub-transaction-")
        })
    {
        bail!("Invalid project recovery journal");
    }
    if !journal.committed {
        for (index, item) in journal.items.iter().enumerate().rev() {
            let target = entries::path(root, &item.relative)?;
            let backup = journal.staging.join(format!("old-{index}"));
            let staged = journal.staging.join(format!("new-{index}"));
            let current = fingerprint_entry(&target)?;
            let started = fingerprint_entry(&backup)?.is_some()
                || (item.before.is_none() && fingerprint_entry(&staged)?.is_none());
            if !started {
                continue;
            }
            if current.is_some() && current != item.after {
                bail!(
                    "Project was externally edited; recovery originals retained for {}",
                    item.relative
                );
            }
            if current.is_some() {
                crate::core::sync_engine::remove_target(&target)?;
            }
            if fingerprint_entry(&backup)?.is_some() {
                if fingerprint_entry(&backup)? != item.before {
                    bail!("Recovery original changed; refusing restoration");
                }
                fs::rename(backup, target)?;
            }
        }
    }
    if journal.staging.exists() {
        fs::remove_dir_all(&journal.staging)?;
    }
    fs::remove_file(&lock.journal)?;
    Ok(())
}

// Publication preserves every project file, unlike source import which filters
// source-control and platform artifacts. Inspect strictly before any copying.
pub(super) fn copy_project_content(source: &Path, destination: &Path) -> Result<()> {
    fingerprint(source)?;
    for entry in walkdir::WalkDir::new(source) {
        let entry = entry?;
        let path = destination.join(entry.path().strip_prefix(source)?);
        if entry.file_type().is_symlink() {
            bail!("Project changed while staging");
        }
        if entry.file_type().is_dir() {
            fs::create_dir_all(path)?;
        } else if entry.file_type().is_file() {
            fs::copy(entry.path(), path)?;
        } else {
            bail!("Unsupported project content type");
        }
    }
    Ok(())
}
