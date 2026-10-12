use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use walkdir::WalkDir;

pub const LIBRARY: &str = ".agents/skills";
pub const MANIFEST: &str = ".agent-hub/project-skills.json";

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct ProjectManifest {
    #[serde(skip)]
    pub baseline: Option<String>,
    pub version: u32,
    pub skills: BTreeMap<String, ProjectEntry>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_json::Value>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ProjectEntry {
    pub id: String,
    pub name: String,
    pub content_hash: String,
    pub targets: BTreeMap<String, String>,
    pub source: Option<ProjectSource>,
    #[serde(default)]
    pub disabled: bool,
    #[serde(default)]
    pub disabled_targets: BTreeSet<String>,
    #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
    pub linked_targets: BTreeSet<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_json::Value>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ProjectSource {
    pub source_type: String,
    pub url: String,
    pub subpath: Option<String>,
    pub branch: Option<String>,
    pub revision: Option<String>,
}

pub fn read(root: &Path) -> Result<ProjectManifest> {
    let path = super::safe_path(root, MANIFEST)?;
    let baseline = fingerprint(&path)?;
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return Ok(ProjectManifest {
                version: 1,
                ..Default::default()
            });
        }
        Err(err) => return Err(err.into()),
    };
    let mut manifest: ProjectManifest = serde_json::from_slice(&bytes)
        .context("Invalid project Skills manifest; existing content was preserved")?;
    if fingerprint(&path)? != baseline {
        bail!("Project manifest changed while reading");
    }
    manifest.baseline = baseline;
    if manifest.version != 1 {
        bail!(
            "Unsupported project Skills manifest version: {}",
            manifest.version
        );
    }
    for (name, entry) in &manifest.skills {
        super::safe_name(name)?;
        for target in entry.targets.values() {
            super::validate_target(root, name, target)?;
            if !target.ends_with(&format!("/{name}")) {
                bail!("Invalid project deployment target");
            }
        }
    }
    Ok(manifest)
}

/// Strict, length-framed portable ownership hash. Includes hidden and otherwise
/// ignored files so replacing a directory never silently drops user additions.
/// File permissions are deliberately excluded: the manifest travels across OSes.
pub fn fingerprint(path: &Path) -> Result<Option<String>> {
    match fs::symlink_metadata(path) {
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err.into()),
        Ok(meta) if meta.file_type().is_symlink() => {
            bail!("Project entry is a symbolic link; import its contents explicitly first");
        }
        Ok(_) => {}
    }
    let mut entries = WalkDir::new(path)
        .into_iter()
        .collect::<std::result::Result<Vec<_>, _>>()?;
    entries.sort_by(|a, b| a.path().cmp(b.path()));
    let mut hash = Sha256::new();
    for entry in entries {
        // Git does not preserve empty directories; file paths already encode
        // every directory needed by the portable content.
        if entry.file_type().is_dir() {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(path)?
            .to_string_lossy()
            .replace(std::path::MAIN_SEPARATOR, "/");
        let bytes = if entry.file_type().is_symlink() {
            bail!("Project content contains a symbolic link; existing content was preserved");
        } else if entry.file_type().is_file() {
            let bytes = fs::read(entry.path())?;
            // Git autocrlf changes checkout bytes. Normalize valid text only;
            // binary files remain byte-exact, including embedded null bytes.
            if !bytes.contains(&0) && std::str::from_utf8(&bytes).is_ok() {
                bytes
                    .windows(2)
                    .enumerate()
                    .filter_map(|(index, pair)| {
                        (!(pair[0] == b'\r' && pair[1] == b'\n')).then_some(bytes[index])
                    })
                    .chain(bytes.last().copied())
                    .collect()
            } else {
                bytes
            }
        } else if entry.file_type().is_dir() {
            Vec::new()
        } else {
            bail!("Unsupported project content type");
        };
        hash.update(if entry.file_type().is_dir() {
            b"d"
        } else {
            b"f"
        });
        hash.update((relative.len() as u64).to_le_bytes());
        hash.update(relative.as_bytes());
        hash.update((bytes.len() as u64).to_le_bytes());
        hash.update(bytes);
    }
    Ok(Some(format!("{:x}", hash.finalize())))
}
