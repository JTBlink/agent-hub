//! Herdr tool preparation is separate from terminal and daemon lifecycles.
mod release;
use anyhow::{bail, Context, Result};
pub use release::ReleaseManifest;
use serde::{Deserialize, Serialize};
use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};

const MANIFEST: &str = "https://herdr.dev/latest.json";
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct HerdrInstallation {
    pub path: String,
    pub version: String,
    pub managed: bool,
}
#[derive(Serialize)]
pub struct HerdrUpdate {
    pub latest_version: String,
    pub has_update: bool,
    pub managed: bool,
}
pub struct HerdrTools {
    root: PathBuf,
    preparation: Mutex<()>,
    cached: Mutex<Option<(Instant, ReleaseManifest)>>,
}
impl Default for HerdrTools {
    fn default() -> Self {
        Self::new(super::central_repo::home_base_dir().join("tools/herdr"))
    }
}
impl HerdrTools {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            preparation: Mutex::new(()),
            cached: Mutex::new(None),
        }
    }
    pub fn managed_installation(&self) -> Result<Option<HerdrInstallation>> {
        let record = self.root.join("current.json");
        if !record.exists() {
            return Ok(None);
        }
        let installed: HerdrInstallation = serde_json::from_slice(&std::fs::read(record)?)?;
        let path = Path::new(&installed.path);
        if !path.exists() {
            return Ok(None);
        }
        if !installed.managed || !super::path_guard::is_path_safe(&self.root, path) {
            bail!("Managed Herdr installation is unavailable; retry installation");
        }
        if !super::tool_detection::executable(path) {
            return Ok(None);
        }
        Ok(Some(installed))
    }
    pub fn detect(&self) -> Result<Option<HerdrInstallation>> {
        if let Some(installed) = self.managed_installation()? {
            return Ok(Some(installed));
        }
        let Some(path) = super::tool_detection::find_command("herdr") else {
            return Ok(None);
        };
        Ok(Some(HerdrInstallation {
            version: binary_version(&path)?,
            path: path.to_string_lossy().into(),
            managed: false,
        }))
    }
    fn manifest(&self, proxy: Option<&str>) -> Result<ReleaseManifest> {
        if let Some((time, manifest)) = self
            .cached
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .as_ref()
        {
            if time.elapsed() < Duration::from_secs(3600) {
                return Ok(manifest.clone());
            }
        }
        let client = super::skillssh_api::build_http_client(proxy, 20);
        let response = client.get(MANIFEST).send()?.error_for_status()?;
        let mut content = Vec::new();
        response
            .take(2 * 1024 * 1024 + 1)
            .read_to_end(&mut content)?;
        if content.len() > 2 * 1024 * 1024 {
            bail!("Herdr release information exceeds the size limit");
        }
        let manifest: ReleaseManifest = serde_json::from_slice(&content)?;
        manifest.asset(&release::target()?)?;
        *self.cached.lock().unwrap_or_else(|e| e.into_inner()) =
            Some((Instant::now(), manifest.clone()));
        Ok(manifest)
    }
    pub fn check_update(&self, proxy: Option<&str>) -> Result<HerdrUpdate> {
        let installed = self.detect()?.context("Herdr is not installed")?;
        let manifest = self.manifest(proxy)?;
        Ok(HerdrUpdate {
            has_update: semver::Version::parse(&manifest.version)?
                > semver::Version::parse(&installed.version)?,
            latest_version: manifest.version,
            managed: installed.managed,
        })
    }
    pub fn install(&self, proxy: Option<&str>) -> Result<HerdrInstallation> {
        if let Some(installed) = self.detect()? {
            return Ok(installed);
        }
        self.download(proxy)
    }
    pub fn update(&self, proxy: Option<&str>) -> Result<HerdrInstallation> {
        let installed = self.detect()?.context("Herdr is not installed")?;
        if !installed.managed {
            bail!("Update Herdr through its original installation channel (Homebrew, mise, Nix or the official installer)");
        }
        self.download(proxy)
    }
    fn download(&self, proxy: Option<&str>) -> Result<HerdrInstallation> {
        let manifest = self.manifest(proxy)?;
        let target = release::target()?;
        let (url, _) = manifest.asset(&target)?;
        let client = super::skillssh_api::build_http_client(proxy, 120);
        let response = client.get(url).send()?.error_for_status()?;
        self.prepare_release(&manifest, &target, response)
    }
    /// Download IO is injected at this public preparation boundary for tests.
    pub fn prepare_release(
        &self,
        manifest: &ReleaseManifest,
        target: &str,
        reader: impl Read,
    ) -> Result<HerdrInstallation> {
        let _guard = self.preparation.lock().unwrap_or_else(|e| e.into_inner());
        std::fs::create_dir_all(&self.root)?;
        let prepared = release::prepare(&self.root, manifest, target, reader)?;
        let installed = HerdrInstallation {
            path: prepared.to_string_lossy().into(),
            version: manifest.version.clone(),
            managed: true,
        };
        let mut record = tempfile::NamedTempFile::new_in(&self.root)?;
        record.write_all(&serde_json::to_vec(&installed)?)?;
        record.as_file().sync_all()?;
        record.persist(self.root.join("current.json"))?;
        Ok(installed)
    }
}
fn binary_version(path: &Path) -> Result<String> {
    let text = super::cli_process::read_command(&path.to_string_lossy(), &["--version"])
        .map_err(anyhow::Error::msg)?;
    text.split_whitespace()
        .find_map(|word| semver::Version::parse(word.trim_start_matches('v')).ok())
        .map(|version| version.to_string())
        .context("Cannot read the installed Herdr version")
}
