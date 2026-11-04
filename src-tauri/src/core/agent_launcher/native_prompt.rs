//! Native initial-task arguments. Evidence: docs/architecture/agent-native-prompts.md.
use crate::core::agent_launch_config::Launch;
use anyhow::{bail, ensure, Result};
use std::{path::Path, process::Command};

pub(super) fn arguments(launch: &Launch, prompt: Option<&str>) -> Result<Vec<String>> {
    let mut args = launch.arguments.clone();
    let Some(prompt) = prompt.filter(|p| !p.is_empty()) else {
        return Ok(args);
    };
    ensure!(
        prompt.len() <= 128 * 1024 && !prompt.contains('\0'),
        "Invalid Agent prompt"
    );
    let prefix: &[&str] = match launch.kind.as_deref() {
        Some("codex" | "claude" | "cursor" | "pi" | "omp" | "droid" | "grok") => &["--"],
        Some("opencode") => &["--prompt"],
        Some("hermes") => &["-z"],
        Some("gemini" | "qwen") => &["--prompt-interactive"],
        Some("copilot" | "cline" | "agy") => &["-i"],
        Some("amp") => &["--execute"],
        Some("kimi") => &["--prompt"],
        Some("kiro") => {
            if !args.iter().any(|arg| arg == "chat") {
                args.insert(0, "chat".into());
            }
            &["--"]
        }
        Some("kilo") => {
            if !args.iter().any(|arg| arg == "run") {
                args.insert(0, "run".into());
            }
            &["--"]
        }
        Some("qodercli") => {
            let name = Path::new(&launch.program)
                .file_stem()
                .and_then(|v| v.to_str());
            if name == Some("qoder") {
                &["--prompt-interactive"]
            } else {
                // Legacy/custom binaries must prove a supported flag; don't guess a product version.
                let mut command = Command::new(&launch.program);
                command.arg("--help");
                let help =
                    crate::core::cli_process::capture_prepared(command, "Qoder help", 5, None)
                        .map_err(anyhow::Error::msg)?
                        .0;
                if help.contains("--prompt-interactive") {
                    &["--prompt-interactive"]
                } else if help.contains("--prompt") {
                    &["--prompt"]
                } else {
                    bail!("Qoder CLI has no supported initial-prompt option; update it or select the current qoder executable")
                }
            }
        }
        _ => bail!("This Agent has no native initial-prompt adapter; configure a supported CLI"),
    };
    args.extend(prefix.iter().map(|value| (*value).into()));
    args.push(prompt.into());
    Ok(args)
}
