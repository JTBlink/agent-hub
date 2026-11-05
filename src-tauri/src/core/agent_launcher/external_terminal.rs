//! Visible native-terminal fallback for CLI/scheduled scenes without Herdr.
//! One private request per launch; uncertain opens are never automatically repeated.
#[cfg(target_os = "macos")]
use crate::core::terminal::launch_command;
use crate::core::{agent_launch_config::Launch, central_repo, cli_bridge};
use anyhow::{ensure, Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    launch: StoredLaunch,
    cwd: PathBuf,
}
#[derive(Serialize, Deserialize)]
struct StoredLaunch {
    program: String,
    arguments: Vec<String>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Receipt {
    pub id: String,
    pub backend: String,
    pub phase: String,
    pub exit_code: Option<i32>,
}
fn root() -> PathBuf {
    central_repo::base_dir().join("runtime/agent-launches")
}
fn directory(id: &str) -> Result<PathBuf> {
    ensure!(
        uuid::Uuid::parse_str(id).is_ok_and(|v| v.to_string() == id),
        "Invalid Agent launch ID"
    );
    let path = root().join(id);
    crate::core::user_config::checked(&path).map_err(anyhow::Error::msg)?;
    Ok(path)
}
fn write_receipt(directory: &Path, receipt: &Receipt) -> Result<()> {
    use std::io::Write;
    let mut temporary = tempfile::NamedTempFile::new_in(directory)?;
    serde_json::to_writer(&mut temporary, receipt)?;
    temporary.flush()?;
    temporary
        .persist(directory.join("receipt.json"))
        .map_err(|e| e.error)?;
    Ok(())
}
/// Open an actual terminal, so login/approval stays accessible when Herdr is absent.
/// `on_submitted` runs before any OS command; callers persist the ID against duplicate triggers.
pub fn open(
    launch: &Launch,
    cwd: &Path,
    prompt: Option<&str>,
    on_submitted: impl FnOnce(&Receipt) -> Result<()>,
) -> Result<Receipt> {
    let cli = cli_bridge::validated_path()?;
    let program = crate::core::tool_detection::resolve_program(&launch.program, cwd)
        .context("Configured Agent executable is unavailable; check its launch instruction")?;
    let mut resolved = launch.clone();
    resolved.program = program
        .to_str()
        .context("Agent executable must be Unicode")?
        .to_owned();
    let arguments = super::native_prompt::arguments(&resolved, prompt)?;
    let id = uuid::Uuid::new_v4().to_string();
    let directory = directory(&id)?;
    fs::create_dir_all(&directory)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))?;
    }
    let cwd = cwd.canonicalize()?;
    ensure!(cwd.is_dir(), "Choose a project directory");
    fs::write(directory.join("request.json"), {
        let bytes = serde_json::to_vec(&Request {
            launch: StoredLaunch {
                program: resolved.program,
                arguments,
            },
            cwd,
        })?;
        ensure!(
            bytes.len() <= 256 * 1024,
            "Agent launch request is too large"
        );
        bytes
    })?;
    let receipt = Receipt {
        id,
        backend: "terminal".into(),
        phase: "submitted".into(),
        exit_code: None,
    };
    write_receipt(&directory, &receipt)?;
    on_submitted(&receipt)?;
    #[cfg(target_os = "macos")]
    {
        let command = launch_command::render(
            "sh",
            cli.to_str().context("Invalid CLI path")?,
            &[
                "agents".into(),
                "launch".into(),
                "terminal-run".into(),
                receipt.id.clone(),
            ],
        )?;
        let script = directory.join("launch.command");
        fs::write(&script, format!("#!/bin/sh\n{command}\n"))?;
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&script, fs::Permissions::from_mode(0o700))?;
        ensure!(
            Command::new("/usr/bin/open")
                .args(["-a", "Terminal"])
                .arg(script)
                .status()?
                .success(),
            "Native terminal could not be opened; inspect launch receipt before retrying"
        );
    }
    #[cfg(target_os = "linux")]
    {
        let terminal = ["x-terminal-emulator", "gnome-terminal", "konsole", "xterm"]
            .into_iter()
            .find_map(|name| {
                crate::core::tool_detection::find_command(name).map(|path| (name, path))
            })
            .context("No native terminal installed; install Herdr or a desktop terminal")?;
        let separator = if terminal.0 == "gnome-terminal" {
            "--"
        } else {
            "-e"
        };
        let mut child = Command::new(terminal.1)
            .arg(separator)
            .arg(cli)
            .args(["agents", "launch", "terminal-run", &receipt.id])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()?;
        std::thread::spawn(move || {
            let _ = child.wait();
        });
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Start-Process opens a console with its own terminal handles. Inheriting
        // a scheduler's redirected pipes would make interactive CLIs see no TTY.
        let mut opener = Command::new("powershell.exe");
        opener.args(["-NoProfile", "-NonInteractive", "-Command",
            "Start-Process -FilePath $env:AGENT_HUB_NATIVE_CLI -ArgumentList @('agents','launch','terminal-run',$env:AGENT_HUB_NATIVE_LAUNCH) -ErrorAction Stop"])
            .env("AGENT_HUB_NATIVE_CLI", cli)
            .env("AGENT_HUB_NATIVE_LAUNCH", &receipt.id)
            .creation_flags(0x08000000);
        ensure!(
            opener.status()?.success(),
            "Native terminal could not be opened; inspect launch receipt before retrying"
        );
    }
    Ok(receipt)
}
/// Runs inside the newly opened native terminal; only one process may claim a request.
pub fn run(id: &str) -> Result<i32> {
    let directory = directory(id)?;
    let _claim = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(directory.join("claimed"))?;
    let mut receipt = status(id)?;
    let bytes = fs::read(directory.join("request.json"))?;
    ensure!(bytes.len() <= 256 * 1024, "Invalid Agent launch request");
    let request: Request = serde_json::from_slice(&bytes)?;
    receipt.phase = "running".into();
    write_receipt(&directory, &receipt)?;
    let mut command = Command::new(&request.launch.program);
    command
        .args(&request.launch.arguments)
        .current_dir(&request.cwd);
    for name in crate::core::agent_runtime::INHERITED_CONTEXT {
        command.env_remove(name);
    }
    let result = command.status();
    receipt.phase = "exited".into();
    receipt.exit_code = Some(
        result
            .as_ref()
            .ok()
            .and_then(|status| status.code())
            .unwrap_or(1),
    );
    write_receipt(&directory, &receipt)?;
    // Task prompts may contain private context and are no longer needed after exit.
    fs::remove_file(directory.join("request.json"))?;
    result.context("Native Agent process could not be started")?;
    Ok(receipt.exit_code.unwrap_or(1))
}
pub fn status(id: &str) -> Result<Receipt> {
    let path = directory(id)?.join("receipt.json");
    crate::core::user_config::checked(&path).map_err(anyhow::Error::msg)?;
    let raw = fs::read(path)?;
    ensure!(raw.len() < 4096, "Invalid launch receipt");
    Ok(serde_json::from_slice(&raw)?)
}

#[cfg(test)]
mod tests;
