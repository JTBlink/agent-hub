//! Version-pinned import from a catalog adapter.

use std::{
    fs::{self, File},
    io::{self, Read},
    path::Path,
};

use agent_hub_core::skill_source::{SkillSource, SkillVersion};
use anyhow::{ensure, Context, Result};
use sha2::{Digest, Sha256};

use super::{
    central_repo, install_prepared_to_destination,
    skill_metadata::{infer_skill_name, parse_skill_md, sanitize_skill_name},
    unique_skill_dest, ArchiveLimits, InstallResult, PreparedSource,
};

const DOWNLOAD_LIMIT: u64 = 64 * 1024 * 1024;
const ARCHIVE_LIMITS: ArchiveLimits = ArchiveLimits {
    entries: 2048,
    extracted_bytes: 128 * 1024 * 1024,
};

/// Install an exact source version into a new, host-owned staging path.
///
/// The caller owns the managed destination and any library transaction. Call
/// off the UI thread, before acquiring a lock that would cover network I/O.
pub fn install_from_skill_source_to_destination(
    source: &dyn SkillSource,
    skill_id: &str,
    version: &SkillVersion,
    name: Option<&str>,
    destination: &Path,
) -> Result<InstallResult> {
    ensure_missing_destination(destination)?;
    prepare_skill_from_source(source, skill_id, version)?.install_to(destination, name)
}

pub(crate) struct PreparedCatalogSkill(PreparedSource);

impl PreparedCatalogSkill {
    /// Install without replacing existing library content. The caller holds RepoLock.
    pub(crate) fn install_as_new_library_skill(
        &self,
        skill_id: &str,
        name: Option<&str>,
        is_reserved: impl Fn(&Path) -> Result<bool>,
    ) -> Result<InstallResult> {
        let skill_dir = self.0.skill_dir();
        let name = match name {
            Some(name) => sanitize_skill_name(name).context("Invalid skill name")?,
            None if matches!(&self.0, PreparedSource::Archive { _temp_dir, .. } if _temp_dir.path() == skill_dir) => {
                parse_skill_md(skill_dir)
                    .name
                    .as_deref()
                    .and_then(sanitize_skill_name)
                    .or_else(|| sanitize_skill_name(skill_id))
                    .filter(|name| !name.starts_with('.'))
                    .context("Catalog skill needs a library name")?
            }
            None => infer_skill_name(skill_dir),
        };
        let library = central_repo::skills_dir();
        fs::create_dir_all(&library)?;
        let destination = unique_skill_dest(&library, &name, skill_dir, false, is_reserved)?;
        let final_name = destination
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(&name);
        self.install_to(&destination, Some(final_name))
    }

    fn install_to(&self, destination: &Path, name: Option<&str>) -> Result<InstallResult> {
        let parent = destination
            .parent()
            .filter(|path| !path.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        let directory = tempfile::tempdir_in(parent)?;
        let staged = directory.path().join("skill");
        let mut result = install_prepared_to_destination(&self.0, name, &staged)?;
        ensure_missing_destination(destination)?;
        fs::rename(staged, destination)?;
        result.central_path = destination.to_owned();
        Ok(result)
    }
}

fn ensure_missing_destination(destination: &Path) -> Result<()> {
    match fs::symlink_metadata(destination) {
        Ok(_) => anyhow::bail!("Skill staging destination already exists"),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error).context("Cannot check skill staging destination"),
    }
}

pub(crate) fn prepare_skill_from_source(
    source: &dyn SkillSource,
    skill_id: &str,
    version: &SkillVersion,
) -> Result<PreparedCatalogSkill> {
    ensure!(
        [skill_id, &version.version]
            .iter()
            .all(|value| !value.trim().is_empty() && !value.chars().any(char::is_control)),
        "Skill ID and version must be nonempty source identifiers"
    );
    if let Some(digest) = version.sha256.as_deref() {
        ensure!(
            digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit()),
            "Invalid skill archive SHA-256"
        );
    }
    let directory = tempfile::tempdir()?;
    let archive = directory.path().join("skill.zip");
    let mut download = source
        .download(skill_id, &version.version)
        .map_err(|_| anyhow::anyhow!("Could not open catalog skill download"))?;
    let bytes = io::copy(
        &mut download.by_ref().take(DOWNLOAD_LIMIT + 1),
        &mut File::create(&archive)?,
    )
    .map_err(|_| anyhow::anyhow!("Could not copy catalog skill archive"))?;
    ensure!(bytes <= DOWNLOAD_LIMIT, "Skill download exceeds size limit");

    if let Some(expected) = version.sha256.as_deref() {
        let mut hash = Sha256::new();
        io::copy(&mut File::open(&archive)?, &mut hash)?;
        ensure!(
            hex::encode(hash.finalize()).eq_ignore_ascii_case(expected),
            "Skill archive SHA-256 mismatch"
        );
    }
    PreparedSource::from_archive(&archive, Some(ARCHIVE_LIMITS)).map(PreparedCatalogSkill)
}

#[cfg(test)]
mod tests;
