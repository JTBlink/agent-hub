//! Scene-independent Agent launch selection. No scheduling, task selection or prompts are stored here.
use crate::core::{
    agent_launch_config::{self, Launch},
    herdr::{
        agents::{self, HerdrAgent, PreparedAgent},
        tools::HerdrTools,
    },
};
use anyhow::{Context, Result};
use std::path::Path;

pub enum Prepared {
    Herdr(PreparedAgent),
    Terminal(portable_pty::CommandBuilder),
}
/// Prefer installed Herdr. A failed/uncertain Herdr launch never triggers a second execution.
pub fn prepare(tools: &HerdrTools, cwd: &Path, agent: HerdrAgent) -> Result<Prepared> {
    let launch = agent_launch_config::resolve(agent.kind())?;
    if let Some(installation) = tools.detect()? {
        return agents::prepare(Path::new(&installation.path), cwd, agent).map(Prepared::Herdr);
    }
    let mut command = terminal_command(&launch, cwd)?;
    if matches!(agent, HerdrAgent::ClaudeTeams) {
        command.env("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "1");
    }
    Ok(Prepared::Terminal(command))
}
/// Native PTY fallback for a desktop terminal. argv is passed directly, without a shell.
pub fn terminal_command(launch: &Launch, cwd: &Path) -> Result<portable_pty::CommandBuilder> {
    let program = crate::core::tool_detection::resolve_program(&launch.program, cwd)
        .context("Configured Agent executable is unavailable; check its launch instruction")?;
    let mut command = portable_pty::CommandBuilder::new(program);
    command.args(&launch.arguments);
    command.cwd(cwd);
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    for name in crate::core::herdr::session::INHERITED_CONTEXT {
        command.env_remove(name);
    }
    Ok(command)
}

pub mod external_terminal;
mod native_prompt;
