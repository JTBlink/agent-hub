//! Script execution uses interpreter arguments, never pastes into an existing shell.
use anyhow::{bail, Result};
use portable_pty::CommandBuilder;
use std::path::Path;

pub fn prepare_script(root: &Path, relative: &str) -> Result<CommandBuilder> {
    let path = crate::core::project_file_actions::existing_path(root, relative)?;
    if !path.is_file() {
        bail!("Select a regular script file");
    }
    let extension = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let interpreter = match extension.as_str() {
        "sh" | "bash" => "bash",
        "zsh" => "zsh",
        "fish" => "fish",
        "ps1" => {
            if cfg!(windows) {
                "powershell.exe"
            } else {
                "pwsh"
            }
        }
        "bat" | "cmd" => {
            if !cfg!(windows) {
                bail!("Batch scripts require Windows");
            }
            "cmd.exe"
        }
        _ => bail!("Unsupported script type"),
    };
    let mut command = CommandBuilder::new(interpreter);
    match extension.as_str() {
        "bat" | "cmd" => {
            command.env("AGENT_HUB_SCRIPT", &path);
            command.args(["/d", "/v:off", "/s", "/c", "\"\"%AGENT_HUB_SCRIPT%\"\""]);
        }
        "ps1" => {
            command.args(["-NoLogo", "-NoProfile", "-File"]);
            command.arg(&path);
        }
        _ => {
            command.arg("--");
            command.arg(&path);
        }
    }
    Ok(command)
}

#[cfg(test)]
mod tests;
