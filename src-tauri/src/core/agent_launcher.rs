//! Scene-independent Agent launch selection. No scheduling, task selection or prompts are stored here.
#[cfg(feature = "herdr")]
use crate::core::herdr::{
    agents::{self, HerdrAgent, PreparedAgent},
    tools::HerdrTools,
};
use crate::core::{
    agent_launch_config::{self, Launch},
    agent_runtime::TerminalAgent,
};
use anyhow::{Context, Result};
use std::path::Path;

pub enum Prepared {
    #[cfg(feature = "herdr")]
    Herdr(PreparedAgent),
    Terminal(portable_pty::CommandBuilder),
}
/// Prefer installed Herdr. A failed/uncertain Herdr launch never triggers a second execution.
#[cfg(feature = "herdr")]
pub fn prepare(tools: &HerdrTools, cwd: &Path, agent: HerdrAgent) -> Result<Prepared> {
    prepare_scheme(tools, cwd, agent, None)
}

#[cfg(feature = "herdr")]
pub fn prepare_scheme(
    tools: &HerdrTools,
    cwd: &Path,
    agent: HerdrAgent,
    scheme_id: Option<&str>,
) -> Result<Prepared> {
    if let Some(installation) = tools.detect()? {
        return agents::prepare_scheme(Path::new(&installation.path), cwd, agent, scheme_id)
            .map(Prepared::Herdr);
    }
    prepare_native_task_scheme(cwd, agent, None, scheme_id)
}

/// Prepare a native Agent without probing optional integration backends.
pub fn prepare_native(cwd: &Path, agent: TerminalAgent) -> Result<Prepared> {
    prepare_native_task(cwd, agent, None)
}

/// Initial task uses the same native argv adapters as external terminals.
pub fn prepare_native_task(
    cwd: &Path,
    agent: TerminalAgent,
    prompt: Option<&str>,
) -> Result<Prepared> {
    prepare_native_task_scheme(cwd, agent, prompt, None)
}

pub fn prepare_native_task_scheme(
    cwd: &Path,
    agent: TerminalAgent,
    prompt: Option<&str>,
    scheme_id: Option<&str>,
) -> Result<Prepared> {
    let mut launch = agent_launch_config::resolve_scheme(agent.kind(), scheme_id)?;
    launch.arguments = native_prompt::arguments(&launch, prompt)?;
    let mut command = terminal_command(&launch, cwd)?;
    if matches!(agent, TerminalAgent::ClaudeTeams) {
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
    for name in crate::core::agent_runtime::INHERITED_CONTEXT {
        command.env_remove(name);
    }
    Ok(command)
}

pub mod external_terminal;
mod native_prompt;
