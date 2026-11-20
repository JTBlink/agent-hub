//! Device-local CLI preferences; no installation-specific paths belong in the product.
mod download;
mod paths;
use crate::core::{central_repo, task_browser::CliLauncher};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{io::Write, path::PathBuf, sync::atomic::AtomicBool};

#[derive(Clone, Default, Deserialize, Serialize)]
pub(crate) struct Preferences {
    pub search_paths: Vec<String>,
}
#[derive(Serialize)]
pub struct Settings {
    pub search_paths: Vec<String>,
    pub path: Option<String>,
    pub source: Option<String>,
}
pub(crate) struct Located {
    pub launcher: CliLauncher,
    pub path: PathBuf,
    pub source: &'static str,
}
pub(crate) struct GlabCli {
    root: PathBuf,
}
impl Default for GlabCli {
    fn default() -> Self {
        Self {
            root: central_repo::home_base_dir().join("tools/glab"),
        }
    }
}
impl GlabCli {
    fn preferences(&self) -> Result<Preferences> {
        match std::fs::read(self.root.join("search-paths.json")) {
            Ok(bytes) => {
                anyhow::ensure!(bytes.len() <= 64 * 1024, "CLI settings are too large");
                let preferences: Preferences = serde_json::from_slice(&bytes)?;
                paths::validate(&preferences.search_paths)?;
                Ok(preferences)
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(Preferences::default())
            }
            Err(error) => Err(error).context("Cannot read GitLab CLI settings"),
        }
    }
    fn locate(&self, preferences: &Preferences) -> Result<Option<Located>> {
        if let Some(path) = std::env::var_os("AGENT_HUB_GLAB_PATH").filter(|v| !v.is_empty()) {
            let found = paths::launcher(&paths::expand(&path.to_string_lossy())?, "environment")?
                .context("AGENT_HUB_GLAB_PATH does not point to an available CLI")?;
            return Ok(Some(found));
        }
        if let Some(found) = paths::preferred(&preferences.search_paths)? {
            return Ok(Some(found));
        }
        if let Some(path) = crate::core::tool_detection::find_command("glab") {
            return paths::launcher(&path, "installed");
        }
        self.managed()
    }
    pub(crate) fn local_launcher(&self) -> Result<Option<CliLauncher>> {
        Ok(self
            .locate(&self.preferences()?)?
            .map(|found| found.launcher))
    }
    /// Inspect local installations only. Opening settings never downloads software.
    pub(crate) fn settings(&self) -> Result<Settings> {
        let preferences = self.preferences()?;
        let found = self.locate(&preferences)?;
        Ok(Settings {
            search_paths: preferences.search_paths,
            path: found
                .as_ref()
                .map(|v| v.path.to_string_lossy().into_owned()),
            source: found.map(|v| v.source.into()),
        })
    }
    pub(crate) fn save(&self, preferences: Preferences) -> Result<Settings> {
        paths::validate(&preferences.search_paths)?;
        // Prepare the response first: a failed lookup must not leave a half-saved form.
        let found = self.locate(&preferences)?;
        std::fs::create_dir_all(&self.root)?;
        let mut file = tempfile::NamedTempFile::new_in(&self.root)?;
        file.write_all(&serde_json::to_vec_pretty(&preferences)?)?;
        file.persist(self.root.join("search-paths.json"))?;
        Ok(Settings {
            search_paths: preferences.search_paths,
            path: found
                .as_ref()
                .map(|v| v.path.to_string_lossy().into_owned()),
            source: found.map(|v| v.source.into()),
        })
    }
    pub(crate) fn resolve(
        &self,
        cancel: &AtomicBool,
        proxy_url: Option<&str>,
    ) -> Result<CliLauncher> {
        download::check_cancel(cancel)?;
        if let Some(found) = self.locate(&self.preferences()?)? {
            return Ok(found.launcher);
        }
        self.install(cancel, proxy_url).map(|found| found.launcher)
    }
}

#[cfg(test)]
mod tests;
