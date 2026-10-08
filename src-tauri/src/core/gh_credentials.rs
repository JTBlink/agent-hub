//! Reuse GitHub CLI's active login without persisting a second token copy.
use super::git_credentials::RemoteCredential;
use std::{path::Path, process::Command};

pub(super) fn load() -> Option<RemoteCredential> {
    // Unit tests never access the developer's actual CLI login. The process
    // adapter is covered separately with an isolated executable fixture.
    #[cfg(test)]
    {
        None
    }
    #[cfg(not(test))]
    {
        read_from(&super::tool_detection::find_command("gh")?)
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
mod tests {
    use super::*;
    #[test]
    fn invalid_executable_and_invalid_command_name_are_ignored() {
        let temp = tempfile::tempdir().unwrap();
        assert!(read_from(&temp.path().join("missing-gh")).is_none());
        assert!(super::super::tool_detection::find_command("../gh").is_none());
    }
    #[cfg(unix)]
    #[test]
    fn cli_login_is_read_without_caching_rejected_or_rotated_values() {
        use std::os::unix::fs::PermissionsExt;
        let temp = tempfile::tempdir().unwrap();
        let executable = temp.path().join("gh");
        let script = |response: &str| {
            std::fs::write(&executable, format!("#!/bin/sh\n[ \"$1 $2 $3 $4\" = 'auth token --hostname github.com' ] || exit 3\n{response}\n")).unwrap();
            std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o700)).unwrap();
        };
        script("printf 'fixture-one\\n'");
        assert_eq!(read_from(&executable).unwrap().password, "fixture-one");
        script("printf 'fixture-two\\n'");
        assert_eq!(read_from(&executable).unwrap().password, "fixture-two");
        script("exit 1");
        assert!(read_from(&executable).is_none());
        script("printf '\\n'");
        assert!(read_from(&executable).is_none());
    }
}
