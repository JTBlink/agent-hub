//! Reuse GitHub CLI's active login without persisting a second token copy.
use crate::core::git_credentials::RemoteCredential;
use std::{path::Path, process::Command};

pub(crate) fn load() -> Option<RemoteCredential> {
    // Unit tests never access the developer's actual CLI login. The process
    // adapter is covered separately with an isolated executable fixture.
    #[cfg(test)]
    {
        None
    }
    #[cfg(not(test))]
    {
        read_from(&crate::core::tool_detection::find_command("gh")?)
    }
}

fn read_from(executable: &Path) -> Option<RemoteCredential> {
    #[allow(unused_mut)]
    let mut command = Command::new(executable);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let output = command
        .args(["auth", "token", "--hostname", "github.com"])
        .env("GH_PROMPT_DISABLED", "1")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let token = String::from_utf8(output.stdout).ok()?.trim().to_string();
    if token.is_empty() || token.contains(['\r', '\n']) {
        return None;
    }
    Some(RemoteCredential {
        username: "x-access-token".into(),
        password: token,
    })
}

#[cfg(test)]
mod tests;
