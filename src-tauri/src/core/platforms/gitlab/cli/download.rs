//! Official stable releases, verified before atomically publishing a managed executable.
use super::{paths, GlabCli, Located};
use anyhow::{bail, Context, Result};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{File, OpenOptions},
    io::{Read, Seek, Write},
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};
const RELEASE: &str = "https://gitlab.com/api/v4/projects/34675721/releases/permalink/latest";
const LIMIT: u64 = 256 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
struct Installed {
    version: String,
}

pub(super) fn check_cancel(cancel: &AtomicBool) -> Result<()> {
    anyhow::ensure!(!cancel.load(Ordering::Acquire), "Query cancelled");
    Ok(())
}
fn version(value: &str) -> Result<String> {
    let version = semver::Version::parse(value.trim_start_matches('v'))?;
    anyhow::ensure!(
        version.pre.is_empty() && version.build.is_empty(),
        "Expected a stable glab release"
    );
    Ok(version.to_string())
}
fn target(os: &str, arch: &str) -> Result<String> {
    let os = match os {
        "macos" => "darwin",
        "linux" => "linux",
        "windows" => "windows",
        _ => bail!("glab is unavailable for this operating system"),
    };
    let arch = match arch {
        "aarch64" => "arm64",
        "x86_64" => "amd64",
        _ => bail!("glab is unavailable for this architecture"),
    };
    Ok(format!("{os}_{arch}"))
}
fn binary() -> &'static str {
    if cfg!(windows) {
        "glab.exe"
    } else {
        "glab"
    }
}

struct Lock(File);
impl Drop for Lock {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.0);
    }
}
impl GlabCli {
    pub(super) fn managed(&self) -> Result<Option<Located>> {
        let bytes = match std::fs::read(self.root.join("current.json")) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        let installed: Installed = serde_json::from_slice(&bytes)?;
        anyhow::ensure!(
            version(&installed.version)? == installed.version,
            "Invalid managed glab release"
        );
        paths::launcher(
            &self
                .root
                .join("releases")
                .join(installed.version)
                .join(binary()),
            "downloaded",
        )
    }
    fn lock(&self, cancel: &AtomicBool) -> Result<Lock> {
        std::fs::create_dir_all(&self.root)?;
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(self.root.join("install.lock"))?;
        let start = Instant::now();
        loop {
            check_cancel(cancel)?;
            match file.try_lock_exclusive() {
                Ok(()) => return Ok(Lock(file)),
                Err(error) if start.elapsed() > Duration::from_secs(120) => {
                    return Err(error).context("Another glab download is still running")
                }
                Err(_) => std::thread::sleep(Duration::from_millis(50)),
            }
        }
    }
    pub(super) fn install(&self, cancel: &AtomicBool, proxy_url: Option<&str>) -> Result<Located> {
        let _lock = self.lock(cancel)?;
        if let Some(found) = self.managed()? {
            return Ok(found);
        }
        let client = crate::core::skillssh_api::build_http_client(proxy_url, 120);
        let release = fetch(&client, RELEASE, 2 * 1024 * 1024, cancel)?;
        let release: serde_json::Value = serde_json::from_slice(&release)?;
        let version = version(
            release["tag_name"]
                .as_str()
                .context("Missing glab release version")?,
        )?;
        let target = target(std::env::consts::OS, std::env::consts::ARCH)?;
        let zipped = target.starts_with("windows_");
        let name = format!(
            "glab_{version}_{target}.{}",
            if zipped { "zip" } else { "tar.gz" }
        );
        let base = format!("https://gitlab.com/gitlab-org/cli/-/releases/v{version}/downloads");
        let checksums = fetch(
            &client,
            &format!("{base}/checksums.txt"),
            1024 * 1024,
            cancel,
        )?;
        let digest = checksum(std::str::from_utf8(&checksums)?, &name)?;
        let mut archive = tempfile::tempfile()?;
        let response = client
            .get(format!("{base}/{name}"))
            .send()?
            .error_for_status()?;
        copy_limited(response, &mut archive, LIMIT, cancel)?;
        archive.rewind()?;
        self.publish(&version, &digest, zipped, archive, cancel)?;
        self.managed()?.context("Downloaded glab is unavailable")
    }
    fn publish(
        &self,
        version: &str,
        expected: &str,
        zipped: bool,
        mut archive: File,
        cancel: &AtomicBool,
    ) -> Result<()> {
        let mut hasher = Sha256::new();
        let mut buffer = [0u8; 64 * 1024];
        loop {
            check_cancel(cancel)?;
            let count = archive.read(&mut buffer)?;
            if count == 0 {
                break;
            }
            hasher.update(&buffer[..count]);
        }
        anyhow::ensure!(
            hex::encode(hasher.finalize()) == expected,
            "glab checksum verification failed; retry the download"
        );
        archive.rewind()?;
        let stage = tempfile::tempdir_in(&self.root)?;
        unpack(archive, zipped, stage.path(), cancel)?;
        let path = stage.path().join(binary());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))?;
        }
        check_cancel(cancel)?;
        let output =
            crate::core::cli_process::read_command(&path.to_string_lossy(), &["--version"])
                .map_err(anyhow::Error::msg)?;
        anyhow::ensure!(
            output.split_whitespace().nth(1) == Some(version),
            "Downloaded glab has an unexpected version"
        );
        let releases = self.root.join("releases");
        std::fs::create_dir_all(&releases)?;
        let destination = releases.join(version);
        // Publish once. Never overwrite an executable that another process may be using.
        if !destination.exists() {
            std::fs::rename(stage.path(), &destination)?;
        } else if !destination.join(binary()).is_file() {
            // Repair a managed directory whose executable was removed.
            std::fs::remove_dir_all(&destination)?;
            std::fs::rename(stage.path(), &destination)?;
        }
        let mut record = tempfile::NamedTempFile::new_in(&self.root)?;
        record.write_all(&serde_json::to_vec(&Installed {
            version: version.into(),
        })?)?;
        record.persist(self.root.join("current.json"))?;
        Ok(())
    }
}
fn fetch(
    client: &reqwest::blocking::Client,
    url: &str,
    limit: u64,
    cancel: &AtomicBool,
) -> Result<Vec<u8>> {
    check_cancel(cancel)?;
    let response = client.get(url).send()?.error_for_status()?;
    let mut bytes = Vec::new();
    copy_limited(response, &mut bytes, limit, cancel)?;
    Ok(bytes)
}
fn copy_limited(
    mut reader: impl Read,
    writer: &mut impl Write,
    limit: u64,
    cancel: &AtomicBool,
) -> Result<()> {
    let mut total = 0u64;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        check_cancel(cancel)?;
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            return Ok(());
        }
        total += count as u64;
        anyhow::ensure!(
            total <= limit,
            "glab download or archive exceeds the size limit"
        );
        writer.write_all(&buffer[..count])?;
    }
}
fn checksum(text: &str, name: &str) -> Result<String> {
    let mut matches = text.lines().filter_map(|line| {
        let mut parts = line.split_whitespace();
        let hash = parts.next()?;
        (parts.next()?.trim_start_matches('*') == name).then_some(hash)
    });
    let hash = matches
        .next()
        .context("Official checksums do not include this glab build")?;
    anyhow::ensure!(
        matches.next().is_none() && hash.len() == 64 && hex::decode(hash)?.len() == 32,
        "Invalid glab checksum"
    );
    Ok(hash.to_ascii_lowercase())
}
fn unpack(archive: File, zipped: bool, root: &Path, cancel: &AtomicBool) -> Result<()> {
    let mut found = false;
    let mut total = 0u64;
    let wanted = if zipped { "glab.exe" } else { "glab" };
    let mut extract = |path: &Path, regular: bool, reader: &mut dyn Read| -> Result<()> {
        let is_binary = path == Path::new(wanted) || path == Path::new(&format!("bin/{wanted}"));
        let is_license = path == Path::new("LICENSE");
        if !is_binary && !is_license {
            return Ok(());
        }
        anyhow::ensure!(regular, "glab archive contains an unexpected link");
        if is_binary {
            anyhow::ensure!(!found, "Duplicate glab executable");
            found = true;
        }
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(root.join(if is_binary { wanted } else { "LICENSE" }))?;
        copy_limited(reader, &mut file, LIMIT, cancel)
    };
    if zipped {
        let mut archive = zip::ZipArchive::new(archive)?;
        anyhow::ensure!(
            archive.len() <= 512,
            "glab archive contains too many entries"
        );
        for i in 0..archive.len() {
            check_cancel(cancel)?;
            let mut entry = archive.by_index(i)?;
            total = total
                .checked_add(entry.size())
                .context("glab archive is too large")?;
            anyhow::ensure!(total <= LIMIT, "glab archive exceeds the size limit");
            let path = entry.enclosed_name().context("Invalid glab archive path")?;
            let regular = !entry.is_dir()
                && !entry
                    .unix_mode()
                    .is_some_and(|mode| mode & 0o170000 == 0o120000);
            extract(&path, regular, &mut entry)?;
        }
    } else {
        let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(archive));
        for (i, entry) in archive.entries()?.enumerate() {
            check_cancel(cancel)?;
            anyhow::ensure!(i < 512, "glab archive contains too many entries");
            let mut entry = entry?;
            total = total
                .checked_add(entry.size())
                .context("glab archive is too large")?;
            anyhow::ensure!(total <= LIMIT, "glab archive exceeds the size limit");
            let path = entry.path()?.into_owned();
            let regular = entry.header().entry_type().is_file();
            extract(&path, regular, &mut entry)?;
        }
    }
    anyhow::ensure!(found, "glab archive does not contain the executable");
    Ok(())
}

#[cfg(test)]
mod tests;
