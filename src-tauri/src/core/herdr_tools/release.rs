use super::binary_version;
use anyhow::{bail, Context, Result};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    io::{Read, Seek, Write},
    path::{Path, PathBuf},
};

const MAX_DOWNLOAD: u64 = 256 * 1024 * 1024;
#[derive(Clone, Debug, Deserialize)]
pub struct ReleaseManifest {
    pub version: String,
    pub assets: HashMap<String, String>,
    pub sha256: HashMap<String, String>,
}
pub fn target() -> Result<String> {
    let os = match std::env::consts::OS {
        "macos" => "macos",
        "linux" => "linux",
        "windows" => "windows",
        _ => bail!("Herdr is not available for this operating system"),
    };
    let target = format!("{os}-{}", std::env::consts::ARCH);
    supported(&target)?;
    Ok(target)
}
fn supported(target: &str) -> Result<()> {
    if !matches!(
        target,
        "macos-aarch64" | "macos-x86_64" | "linux-aarch64" | "linux-x86_64" | "windows-x86_64"
    ) {
        bail!("Herdr is not available for this architecture");
    }
    Ok(())
}
impl ReleaseManifest {
    pub(super) fn asset(&self, target: &str) -> Result<(&str, &str)> {
        supported(target)?;
        let version = semver::Version::parse(&self.version)?;
        if !version.pre.is_empty() || version.to_string() != self.version {
            bail!("Invalid stable Herdr version");
        }
        let url = self
            .assets
            .get(target)
            .context("Herdr release does not include this platform")?;
        let expected = format!(
            "https://github.com/herdrdev/herdr/releases/download/v{}/herdr-{target}{}",
            self.version,
            if target.starts_with("windows-") {
                ".zip"
            } else {
                ""
            }
        );
        if url != &expected {
            bail!("Unexpected Herdr download source");
        }
        let digest = self.sha256.get(target).context("Missing Herdr checksum")?;
        if digest.len() != 64 || hex::decode(digest)?.len() != 32 {
            bail!("Invalid Herdr checksum");
        }
        Ok((url, digest))
    }
}
pub(super) fn prepare(
    root: &Path,
    manifest: &ReleaseManifest,
    target: &str,
    reader: impl Read,
) -> Result<PathBuf> {
    let (_, digest) = manifest.asset(target)?;
    let stage = tempfile::tempdir_in(root)?;
    let mut archive = tempfile::tempfile()?;
    let size = std::io::copy(&mut reader.take(MAX_DOWNLOAD + 1), &mut archive)?;
    if size > MAX_DOWNLOAD {
        bail!("Herdr download exceeds the size limit");
    }
    archive.rewind()?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = archive.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    if hex::encode(hasher.finalize()) != digest.to_ascii_lowercase() {
        bail!("Herdr integrity verification failed; the previous installation is unchanged");
    }
    archive.rewind()?;
    let relative = if target.starts_with("windows-") {
        unpack_windows(archive, stage.path())?
    } else {
        let path = stage.path().join("herdr");
        let mut file = std::fs::File::create(&path)?;
        std::io::copy(&mut archive, &mut file)?;
        file.flush()?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))?;
        }
        PathBuf::from("herdr")
    };
    if binary_version(&stage.path().join(&relative))? != manifest.version {
        bail!("Downloaded Herdr version does not match the release");
    }
    let destination = root
        .join("releases")
        .join(&manifest.version)
        .join(format!("{target}-{}", &digest[..12]));
    std::fs::create_dir_all(destination.parent().context("Missing release directory")?)?;
    if destination.exists() {
        // Never replace running executables. An existing verified version is reusable.
        if binary_version(&destination.join(&relative))? != manifest.version {
            bail!("Existing Herdr release is invalid");
        }
    } else {
        std::fs::rename(stage.path(), &destination)?;
    }
    Ok(destination.join(relative))
}
fn unpack_windows(file: std::fs::File, root: &Path) -> Result<PathBuf> {
    let mut archive = zip::ZipArchive::new(file)?;
    if archive.len() > 512 {
        bail!("Herdr archive contains too many files");
    }
    let mut total = 0u64;
    let mut executable = None;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let relative = entry.enclosed_name().context("Unsafe Herdr archive path")?;
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            bail!("Herdr archive contains a symbolic link");
        }
        total = total
            .checked_add(entry.size())
            .context("Herdr archive is too large")?;
        if total > MAX_DOWNLOAD {
            bail!("Herdr archive exceeds the size limit");
        }
        let path = root.join(&relative);
        if entry.is_dir() {
            std::fs::create_dir_all(path)?;
            continue;
        }
        std::fs::create_dir_all(path.parent().context("Invalid archive path")?)?;
        let mut output = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)?;
        std::io::copy(&mut entry, &mut output)?;
        if relative.file_name().is_some_and(|name| name == "herdr.exe") {
            if executable.is_some() {
                bail!("Herdr archive contains multiple executables");
            }
            executable = Some(relative);
        }
    }
    executable.context("Herdr archive does not contain herdr.exe")
}
