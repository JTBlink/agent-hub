//! One explicit-target Herdr command transport for session routing and Agent/control entry points.
use anyhow::{bail, Context, Result};
use serde_json::Value;
use std::{path::Path, process::Command};

#[derive(Debug)]
pub(crate) struct CommandFailure {
    code: String,
    message: String,
}

impl std::fmt::Display for CommandFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for CommandFailure {}

pub(crate) fn command_failure(raw: &str) -> Option<CommandFailure> {
    let start = raw.find('{')?;
    let value: Value = serde_json::from_str(&raw[start..]).ok()?;
    let error = value.get("error").unwrap_or(&value);
    Some(CommandFailure {
        code: error
            .get("code")
            .or_else(|| value.get("code"))?
            .as_str()?
            .into(),
        message: error
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("Herdr command failed")
            .into(),
    })
}

pub(crate) fn rejected_before_start(error: &anyhow::Error) -> bool {
    error.chain().any(|cause| {
        cause
            .downcast_ref::<CommandFailure>()
            .is_some_and(|failure| failure.code == "agent_pane_busy")
    })
}

pub(crate) struct Client<'a> {
    pub executable: &'a Path,
    pub session: Option<&'a str>,
    pub cwd: Option<&'a Path>,
}

impl Client<'_> {
    pub fn command(&self) -> Command {
        let mut command = Command::new(self.executable);
        for key in crate::core::agent_runtime::INHERITED_CONTEXT {
            command.env_remove(key);
        }
        if let Some(session) = self.session {
            command.args(["--session", session]);
        }
        if let Some(cwd) = self.cwd {
            command.current_dir(cwd);
        }
        command
    }

    pub fn text(&self, args: &[&str], timeout: u64) -> Result<String> {
        let mut command = self.command();
        command.args(args);
        crate::core::cli_process::capture_prepared(command, "Herdr", timeout, None)
            .map(|value| value.0)
            .map_err(|raw| {
                command_failure(&raw)
                    .map(anyhow::Error::new)
                    .unwrap_or_else(|| anyhow::Error::msg(raw))
            })
    }

    pub fn call(&self, args: &[&str], timeout: u64) -> Result<Value> {
        let data: Value = serde_json::from_str(&self.text(args, timeout)?)
            .context("Invalid Herdr response; check client/server compatibility")?;
        if data.get("error").is_some() {
            if let Some(error) = command_failure(&data.to_string()) {
                return Err(error.into());
            }
            bail!("Herdr rejected the request: {}", data["error"]);
        }
        Ok(data.get("result").unwrap_or(&data).clone())
    }
}
