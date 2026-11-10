//! Render copied file references as literal input, without submitting a command.
use anyhow::{ensure, Context, Result};
use std::path::PathBuf;

pub fn file_input(paths: &[PathBuf]) -> Result<Option<String>> {
    if paths.is_empty() {
        return Ok(None);
    }
    let mut words = Vec::with_capacity(paths.len());
    for path in paths {
        let value = path
            .to_str()
            .context("Clipboard file path is not valid Unicode")?;
        ensure!(
            !value.chars().any(char::is_control),
            "Clipboard file path contains control characters"
        );
        #[cfg(windows)]
        {
            ensure!(
                !value.contains(['%', '!', '"']),
                "This file path cannot be safely pasted into the Windows shell"
            );
            words.push(format!("\"{value}\""));
        }
        #[cfg(not(windows))]
        words.push(super::launch_command::quote_posix(value));
    }
    Ok(Some(words.join(" ")))
}

#[cfg(test)]
mod tests;
