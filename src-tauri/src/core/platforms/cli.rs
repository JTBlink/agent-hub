//! CLI transport shared by repository queries and platform account management.
use crate::core::task_browser::{CliLauncher, Provider, TaskFailure};
use std::{
    path::{Path, PathBuf},
    sync::atomic::AtomicBool,
};

pub struct PlatformCli<'a> {
    pub provider: Provider,
    pub host: &'a str,
    pub launcher: Option<&'a CliLauncher>,
    pub cwd: &'a Path,
}
impl PlatformCli<'_> {
    pub fn command(&self, args: &[String]) -> Result<(PathBuf, Vec<String>), TaskFailure> {
        let default = self.provider.cli()?;
        let name = self
            .launcher
            .map(|launcher| launcher.program.as_str())
            .unwrap_or(default);
        let path = if Path::new(name).is_absolute() {
            let path = PathBuf::from(name);
            crate::core::tool_detection::executable(&path).then_some(path)
        } else {
            crate::core::tool_detection::find_command(name)
        }
        .ok_or_else(|| TaskFailure::new("missing_cli", "Platform CLI launcher is unavailable"))?;
        let mut arguments = self
            .launcher
            .map(|launcher| launcher.args.clone())
            .unwrap_or_default();
        arguments.extend_from_slice(args);
        Ok((path, arguments))
    }
    pub fn run(&self, args: &[String], cancel: &AtomicBool) -> Result<String, TaskFailure> {
        if cancel.load(std::sync::atomic::Ordering::Acquire) {
            return Err(TaskFailure::new("cancelled", "Query cancelled"));
        }
        let (path, args) = self.command(args)?;
        crate::core::cli_process::run(
            &path.to_string_lossy(),
            &args.iter().map(String::as_str).collect::<Vec<_>>(),
            &[
                ("GH_PROMPT_DISABLED", "1"),
                ("GITLAB_HOST", self.host),
                ("GLAB_CHECK_UPDATE", "false"),
            ],
            20,
            Some(self.cwd),
            Some(cancel),
        )
        .map_err(TaskFailure::cli)
    }
}

pub(crate) fn validate_host(host: &str) -> anyhow::Result<()> {
    if host.starts_with('-')
        || host
            .chars()
            .any(|character| character.is_control() || character.is_whitespace())
        || host.contains(['/', '\\', '?', '#', '@', ' ', '\r', '\n', '\0'])
    {
        anyhow::bail!("Enter a hostname without a URL path or credentials");
    }
    let url = reqwest::Url::parse(&format!("https://{host}"))?;
    if url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        anyhow::bail!("Enter a hostname without a URL path or credentials");
    }
    Ok(())
}
