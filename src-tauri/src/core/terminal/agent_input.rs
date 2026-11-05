//! One atomic bracketed paste for an owned native Agent, never a Shell command.
use anyhow::{ensure, Result};
pub(super) fn prompt_bytes(prompt: &str) -> Result<Vec<u8>> {
    ensure!(
        !prompt.trim().is_empty() && prompt.len() <= 32 * 1024,
        "Agent prompt exceeds the supported range"
    );
    let prompt = prompt.replace("\r\n", "\n");
    ensure!(
        !prompt
            .chars()
            .any(|c| c.is_control() && !matches!(c, '\n' | '\t')),
        "Agent prompt contains terminal control characters"
    );
    Ok(format!("\x1b[200~{prompt}\x1b[201~\r").into_bytes())
}

#[cfg(test)]
#[path = "agent_input_tests.rs"]
mod tests;
