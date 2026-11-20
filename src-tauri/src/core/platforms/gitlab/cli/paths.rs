use super::Located;
use crate::core::{task_browser::CliLauncher, tool_detection};
use anyhow::{bail, Context, Result};
use std::path::{Path, PathBuf};

pub(super) fn expand(value: &str) -> Result<PathBuf> {
    let path = if let Some(relative) = value.strip_prefix("~/") {
        dirs::home_dir()
            .context("Home directory is unavailable")?
            .join(relative)
    } else {
        PathBuf::from(value)
    };
    anyhow::ensure!(
        path.is_absolute(),
        "Enter an absolute CLI path or a path beginning with ~/"
    );
    Ok(path)
}
pub(super) fn validate(paths: &[String]) -> Result<()> {
    anyhow::ensure!(paths.len() <= 16, "Use at most 16 CLI search paths");
    for value in paths {
        anyhow::ensure!(
            !value.is_empty()
                && value.len() <= 4096
                && !value.contains(['\0', '\r', '\n'])
                && !value.contains("**"),
            "Invalid CLI search path; recursive wildcards are not supported"
        );
        let path = expand(value)?;
        glob::Pattern::new(&path.to_string_lossy())?;
    }
    Ok(())
}
pub(super) fn preferred(paths: &[String]) -> Result<Option<Located>> {
    validate(paths)?;
    for value in paths {
        let expanded = expand(value)?;
        let mut candidates = glob::glob(&expanded.to_string_lossy())?
            .take(256)
            .collect::<std::result::Result<Vec<_>, _>>()?;
        candidates.sort_by_key(|path| {
            let version = path.components().rev().find_map(|part| {
                semver::Version::parse(part.as_os_str().to_str()?.trim_start_matches('v')).ok()
            });
            (version, path.clone())
        });
        for path in candidates.into_iter().rev() {
            if let Some(found) = launcher(&path, "custom")? {
                return Ok(Some(found));
            }
        }
    }
    Ok(None)
}
pub(super) fn launcher(path: &Path, source: &'static str) -> Result<Option<Located>> {
    launcher_with_node(path, source, || tool_detection::find_command("node"))
}
pub(super) fn launcher_with_node(
    path: &Path,
    source: &'static str,
    node: impl FnOnce() -> Option<PathBuf>,
) -> Result<Option<Located>> {
    let path = if path.is_dir() {
        path.join(if cfg!(windows) { "glab.exe" } else { "glab" })
    } else {
        path.into()
    };
    if !path.is_file() {
        return Ok(None);
    }
    let launcher = if path.extension().is_some_and(|ext| ext == "mjs") {
        let Some(node) = node() else {
            return Ok(None);
        };
        CliLauncher {
            program: node.to_string_lossy().into_owned(),
            args: vec![path.to_string_lossy().into_owned()],
        }
    } else if tool_detection::executable(&path) {
        CliLauncher {
            program: path.to_string_lossy().into_owned(),
            args: Vec::new(),
        }
    } else {
        return Ok(None);
    };
    if !Path::new(&launcher.program).is_absolute() {
        bail!("CLI discovery returned a relative executable");
    }
    Ok(Some(Located {
        launcher,
        path,
        source,
    }))
}
