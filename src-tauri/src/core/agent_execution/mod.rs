//! Managed Agent execution shared by CLI, automation and other programming entry points.
//! Business selection and verdicts remain with callers; Herdr startup uses core/herdr.
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

#[derive(Debug, Deserialize, Serialize)]
pub struct ExecutionRequest {
    pub config_file: PathBuf,
    pub prompt_file: PathBuf,
    pub state_directory: PathBuf,
    /// Stable caller identity; legacy tasks pass their scripts directory to preserve Agent names.
    pub identity_directory: PathBuf,
    pub workdir: PathBuf,
    #[serde(default)]
    pub prompt_context: String,
}

#[derive(Debug, Serialize)]
pub struct ExecutionResult {
    pub exit_code: i32,
    pub checkpoint: Option<Value>,
}

pub fn python_module() -> Result<PathBuf> {
    super::python_support::publish("agent_execution", include_str!("runtime.py"))
}

/// Run once and stream output. A timeout/unknown backend result never means permission to retry.
pub fn run(request: &ExecutionRequest, mut output: impl FnMut(&str)) -> Result<ExecutionResult> {
    for path in [
        &request.config_file,
        &request.prompt_file,
        &request.state_directory,
        &request.identity_directory,
        &request.workdir,
    ] {
        anyhow::ensure!(path.is_absolute(), "Agent execution paths must be absolute");
    }
    anyhow::ensure!(request.workdir.is_dir(), "Agent workspace is unavailable");
    let python = match std::env::var_os("AGENT_HUB_PYTHON") {
        Some(path) => PathBuf::from(path),
        None => super::python_support::interpreter()?,
    };
    let bridge = super::cli_bridge::validated_path()?;
    let mut command = Command::new(python);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    #[cfg(feature = "herdr")]
    command.env(
        "AGENT_HUB_HERDR_RUNTIME",
        super::herdr::agents::execution_module()?,
    );
    #[cfg(not(feature = "herdr"))]
    command.env_remove("AGENT_HUB_HERDR_RUNTIME");
    let mut child = command
        .arg(python_module()?)
        .current_dir(&request.workdir)
        .env("AGENT_HUB_CLI", bridge)
        .env(
            "AGENT_HUB_STATE_RUNTIME",
            super::state_store::python_module()?,
        )
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .context("Cannot start the shared Agent executor")?;
    let write = (|| -> Result<()> {
        let mut stdin = child
            .stdin
            .take()
            .context("Agent request input is unavailable")?;
        serde_json::to_writer(&mut stdin, request)?;
        stdin.flush()?;
        Ok(())
    })();
    if let Err(error) = write {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }
    let stdout = child.stdout.take().context("Agent output is unavailable")?;
    let read = (|| -> Result<()> {
        for line in BufReader::new(stdout).lines() {
            output(&line?);
        }
        Ok(())
    })();
    let status = child.wait()?;
    read?;
    Ok(ExecutionResult {
        exit_code: status.code().unwrap_or(1),
        checkpoint: status_at(&request.state_directory)?,
    })
}

/// Inspect an existing execution without creating directories, panes or records.
pub fn status_at(directory: &Path) -> Result<Option<Value>> {
    super::state_store::read_json(&directory.join(".herdr-run.json"))
}

#[cfg(test)]
mod tests;
