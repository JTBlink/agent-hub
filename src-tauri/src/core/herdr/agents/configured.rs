//! Share configured startup between attached terminals, sidebar actions and scheduled tasks.
use crate::core::{agent_launch_config::Launch, terminal::launch_command};
use anyhow::{bail, ensure, Context, Result};
use serde_json::Value;
use std::{
    path::Path,
    time::{Duration, Instant},
};

fn canonical_program(kind: &str) -> &str {
    match kind {
        "cursor" => "cursor-agent",
        "kiro" => "kiro-cli",
        _ => kind,
    }
}
pub(super) fn start(
    launch: &Launch,
    name: &str,
    pane: &str,
    mut call: impl FnMut(&[&str], u64) -> Result<Value>,
) -> Result<Value> {
    let kind = launch
        .kind
        .as_deref()
        .context("This Agent has no compatible Herdr CLI kind")?;
    if launch.program == canonical_program(kind) {
        let mut args = vec![
            "agent",
            "start",
            name,
            "--kind",
            kind,
            "--pane",
            pane,
            "--timeout",
            "30000",
            "--",
        ];
        args.extend(launch.arguments.iter().map(String::as_str));
        // Only this explicit pre-start rejection proves that nothing was launched.
        // Other failures may follow a successful launch and must never be replayed.
        for attempt in 0..40 {
            match call(&args, 40) {
                Err(error)
                    if attempt < 39 && super::super::client::rejected_before_start(&error) =>
                {
                    std::thread::sleep(Duration::from_millis(250));
                }
                result => return result,
            }
        }
        unreachable!("the final startup result is always returned");
    }
    // A custom executable must not be silently replaced with Herdr's canonical binary.
    // Check the target is a plain shell before injecting exactly one literal command.
    let deadline = Instant::now() + Duration::from_secs(3);
    let shell = loop {
        let info = call(&["pane", "process-info", "--pane", pane], 5)?;
        let info = info
            .get("process_info")
            .context("Cannot verify target shell")?;
        if let Some(processes) = info["foreground_processes"].as_array() {
            if processes.len() == 1
                && info["shell_pid"].is_number()
                && processes[0]["pid"] == info["shell_pid"]
            {
                let executable = processes[0]["name"]
                    .as_str()
                    .context("Cannot identify target shell")?;
                break Path::new(executable)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .context("Invalid shell name")?
                    .to_ascii_lowercase();
            }
        }
        ensure!(
            Instant::now() < deadline,
            "Target pane is busy; configured Agent was not started"
        );
        std::thread::sleep(Duration::from_millis(100));
    };
    let command = launch_command::render(&shell, &launch.program, &launch.arguments)?;
    call(&["pane", "run", pane, &command], 5)?;
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        if let Ok(info) = call(&["agent", "get", pane], 5) {
            let agent = info
                .get("agent")
                .context("Cannot verify configured Agent")?;
            ensure!(
                agent["agent"].as_str() == Some(kind),
                "Configured executable started a different Agent; inspect its terminal"
            );
            call(&["agent", "rename", pane, name], 5)?;
            return call(&["agent", "wait", name, "--timeout", "30000"], 35);
        }
        if Instant::now() >= deadline {
            bail!("Configured Agent did not become ready; pane retained. Inspect terminal output before retrying")
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

#[cfg(test)]
#[path = "configured_tests.rs"]
mod tests;
