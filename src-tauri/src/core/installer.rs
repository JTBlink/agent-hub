use anyhow::{bail, ensure, Context, Result};
use std::io::Read;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use super::central_repo;
use super::content_hash;
use super::skill_metadata::{self, sanitize_skill_name};
use super::sync_engine;

#[cfg(test)]
mod import_tests;
mod source;
pub use source::install_from_skill_source_to_destination;
pub(crate) use source::prepare_skill_from_source;

#[derive(Clone, Copy)]
struct ArchiveLimits {
    entries: usize,
    extracted_bytes: u64,
}

pub struct InstallResult {
    pub name: String,
    pub description: Option<String>,
    pub central_path: PathBuf,
    pub content_hash: String,
}

enum PreparedSource {
    Directory(PathBuf),
    Archive {
        _temp_dir: tempfile::TempDir,
        skill_dir: PathBuf,
    },
}

impl PreparedSource {
    fn open(source: &Path) -> Result<Self> {
        if source.is_dir() {
            validate_skill_source(source)?;
            Ok(PreparedSource::Directory(source.to_path_buf()))
        } else {
            Self::from_archive(source, None)
        }
    }

    fn from_archive(source: &Path, limits: Option<ArchiveLimits>) -> Result<Self> {
        let ext = source
            .extension()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_default();
        if ext != "zip" && ext != "skill" {
            bail!("Unsupported archive format: {}", ext);
        }

        let temp_dir = tempfile::tempdir()?;
        let file = std::fs::File::open(source)?;
        let mut archive = zip::ZipArchive::new(file)?;
        safe_extract(&mut archive, temp_dir.path(), limits)?;

        // Find supported skill markers for local/archive import flows.
        let mut found = Vec::new();
        for entry in WalkDir::new(temp_dir.path()).max_depth(4) {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy();
            if entry.file_type().is_file()
                && skill_metadata::SKILL_DIR_MARKERS.contains(&name.as_ref())
            {
                if let Some(parent) = entry.path().parent() {
                    found.push(parent.to_path_buf());
                }
            }
        }

        found.sort();
        found.dedup();

        let skill_dir = match found.len() {
            0 => bail!("INVALID_SKILL_SOURCE: Archive contains no SKILL.md or skill.md file"),
            1 => found.into_iter().next().unwrap(),
            _ => bail!("Multiple skill directories found in archive"),
        };

        Ok(PreparedSource::Archive {
            _temp_dir: temp_dir,
            skill_dir,
        })
    }

    fn skill_dir(&self) -> &Path {
        match self {
            PreparedSource::Directory(p) => p,
            PreparedSource::Archive { skill_dir, .. } => skill_dir,
        }
    }
}

fn validate_skill_source(source: &Path) -> Result<()> {
    if !skill_metadata::is_valid_skill_dir(source) {
        bail!("INVALID_SKILL_SOURCE: Select a skill folder containing a SKILL.md or skill.md file");
    }
    Ok(())
}

pub fn install_from_local(source: &Path, name: Option<&str>) -> Result<InstallResult> {
    let prepared = PreparedSource::open(source)?;
    let skill_dir = prepared.skill_dir();

    let sanitized_name = match name {
        Some(n) if !n.is_empty() => {
            sanitize_skill_name(n).ok_or_else(|| anyhow::anyhow!("Invalid skill name: '{}'", n))?
        }
        _ => skill_metadata::infer_skill_name(skill_dir),
    };

    let skills_dir = central_repo::skills_dir();
    let dest = unique_skill_dest(&skills_dir, &sanitized_name, skill_dir, true, |_| Ok(false))?;
    let final_name = dest
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| sanitized_name.clone());

    install_skill_dir_to_destination(skill_dir, &final_name, &dest)
}

pub fn install_from_local_to_destination(
    source: &Path,
    name: Option<&str>,
    destination: &Path,
) -> Result<InstallResult> {
    let prepared = PreparedSource::open(source)?;
    install_prepared_to_destination(&prepared, name, destination)
}

fn install_prepared_to_destination(
    prepared: &PreparedSource,
    name: Option<&str>,
    destination: &Path,
) -> Result<InstallResult> {
    let skill_dir = prepared.skill_dir();
    let skill_name = match name {
        Some(n) if !n.is_empty() => {
            sanitize_skill_name(n).ok_or_else(|| anyhow::anyhow!("Invalid skill name: '{}'", n))?
        }
        _ => skill_metadata::infer_skill_name(skill_dir),
    };
    install_skill_dir_to_destination(skill_dir, &skill_name, destination)
}

pub fn resolve_local_skill_name(source: &Path, name: Option<&str>) -> Result<String> {
    let prepared = PreparedSource::open(source)?;
    let skill_dir = prepared.skill_dir();

    Ok(match name {
        Some(n) if !n.is_empty() => {
            sanitize_skill_name(n).ok_or_else(|| anyhow::anyhow!("Invalid skill name: '{}'", n))?
        }
        _ => skill_metadata::infer_skill_name(skill_dir),
    })
}

pub fn hash_local_source(source: &Path) -> Result<String> {
    let prepared = PreparedSource::open(source)?;
    content_hash::hash_directory(prepared.skill_dir())
}

/// [`hash_local_source`] with CRLF folded to LF, for the "do these differ by
/// anything other than line endings?" tiebreaker. Goes through the same
/// [`PreparedSource`] so an archive source is answered the same way a
/// directory source is.
pub fn hash_local_source_eol_insensitive(source: &Path) -> Result<String> {
    let prepared = PreparedSource::open(source)?;
    content_hash::hash_directory_eol_insensitive(prepared.skill_dir())
}

pub fn install_from_git_dir(source: &Path, name: Option<&str>) -> Result<InstallResult> {
    install_from_local(source, name)
}

pub fn install_skill_dir_to_destination(
    source: &Path,
    name: &str,
    destination: &Path,
) -> Result<InstallResult> {
    // All entry points, including direct Git installs and reimports, must
    // validate before an existing destination can be removed.
    validate_skill_source(source)?;
    let meta = skill_metadata::parse_skill_md(source);

    if sync_engine::is_library_entry(destination)
        && source.canonicalize()? == destination.canonicalize().unwrap_or_default()
    {
        return Ok(InstallResult {
            name: name.to_string(),
            description: meta.description,
            central_path: destination.to_path_buf(),
            content_hash: content_hash::hash_directory(destination)?,
        });
    }
    sync_engine::ensure_dst_not_inside_src(source, destination)?;

    if destination.exists() {
        std::fs::remove_dir_all(destination)
            .with_context(|| format!("Failed to remove existing {:?}", destination))?;
    }

    copy_skill_dir(source, destination)?;

    let hash = content_hash::hash_directory(destination)?;

    Ok(InstallResult {
        name: name.to_string(),
        description: meta.description,
        central_path: destination.to_path_buf(),
        content_hash: hash,
    })
}

/// Extract a ZIP archive. Source adapters require strict paths and bounded extraction.
fn safe_extract(
    archive: &mut zip::ZipArchive<std::fs::File>,
    dest: &Path,
    limits: Option<ArchiveLimits>,
) -> Result<()> {
    let mut remaining = limits.map(|limit| limit.extracted_bytes);
    if let Some(limit) = limits {
        ensure!(
            archive.len() <= limit.entries,
            "Skill archive has too many entries"
        );
    }
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;

        let Some(entry_path) = entry
            .enclosed_name()
            .map(|name| dest.join(name))
            .filter(|path| path.starts_with(dest))
        else {
            ensure!(limits.is_none(), "Skill archive contains an invalid path");
            continue;
        };
        if limits.is_some() {
            ensure!(
                entry.is_file() || entry.is_dir(),
                "Skill archive contains an unsupported entry"
            );
        }

        if entry.is_dir() {
            std::fs::create_dir_all(&entry_path)?;
        } else {
            if let Some(parent) = entry_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut outfile = std::fs::File::create(&entry_path)?;
            if let Some(bytes) = remaining.as_mut() {
                ensure!(
                    entry.size() <= *bytes,
                    "Extracted skill archive exceeds size limit"
                );
                let written = std::io::copy(&mut (&mut entry).take(*bytes + 1), &mut outfile)?;
                ensure!(
                    written <= *bytes,
                    "Extracted skill archive exceeds size limit"
                );
                *bytes -= written;
            } else {
                std::io::copy(&mut entry, &mut outfile)?;
            }

            // Restore Unix file permissions (especially executable bits)
            // from the ZIP entry metadata.
            #[cfg(unix)]
            {
                if let Some(mode) = entry.unix_mode() {
                    use std::os::unix::fs::PermissionsExt;
                    let mode = if limits.is_some() { mode & 0o777 } else { mode };
                    let _ = std::fs::set_permissions(
                        &entry_path,
                        std::fs::Permissions::from_mode(mode),
                    );
                }
            }
        }
    }
    Ok(())
}

/// Return a collision-safe destination directory for an install.
///
/// Rules:
/// - Prefer `<name>` if missing and not reserved by the caller.
/// - Reuse an existing directory when it clearly belongs to the same skill
///   (same metadata `name`, or legacy no-metadata `<name>` directory).
/// - Otherwise allocate `<name>-2`, `<name>-3`, ...
fn unique_skill_dest(
    parent: &Path,
    sanitized_name: &str,
    source: &Path,
    reuse_identical: bool,
    is_reserved: impl Fn(&Path) -> Result<bool>,
) -> Result<PathBuf> {
    let source_hash = reuse_identical
        .then(|| content_hash::hash_directory(source))
        .transpose()?;

    for i in 1u32.. {
        let candidate = if i == 1 {
            parent.join(sanitized_name)
        } else {
            parent.join(format!("{}-{}", sanitized_name, i))
        };

        if is_reserved(&candidate)? {
            continue;
        }

        if !candidate.exists() && !candidate.is_symlink() {
            return Ok(candidate);
        }

        if source_hash.as_deref().is_some_and(|hash| {
            content_hash::hash_directory(&candidate).ok().as_deref() == Some(hash)
        }) {
            return Ok(candidate);
        }
    }

    Ok(parent.join(sanitized_name))
}

fn copy_skill_dir(src: &Path, dst: &Path) -> Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ft = entry.file_type()?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        if name_str == ".git" || name_str == ".DS_Store" {
            continue;
        }

        // Skip symlinks to prevent exfiltration of files outside the skill directory
        if ft.is_symlink() {
            continue;
        }

        let dest_path = dst.join(&name);
        if ft.is_dir() {
            copy_skill_dir(&entry.path(), &dest_path)?;
        } else {
            std::fs::copy(entry.path(), &dest_path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;
