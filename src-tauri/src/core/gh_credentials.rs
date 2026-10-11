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
        use std::os::unix::fs::symlink;
        let temp = tempfile::tempdir().unwrap();
        let executable = temp.path().join("gh");
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/gh-auth-token.sh");
        // Rewriting an executable between spawns can race with concurrent
        // subprocesses on Linux. Rotate data, never the executable inode.
        symlink(fixture, &executable).unwrap();
        let response = temp.path().join("response");
        std::fs::write(&response, "fixture-one\n").unwrap();
        assert_eq!(read_from(&executable).unwrap().password, "fixture-one");
        std::fs::write(&response, "fixture-two\n").unwrap();
        assert_eq!(read_from(&executable).unwrap().password, "fixture-two");
        let rejected = temp.path().join("rejected");
        std::fs::write(&rejected, "").unwrap();
        assert!(read_from(&executable).is_none());
        std::fs::remove_file(&rejected).unwrap();
        std::fs::write(&response, "\n").unwrap();
        assert!(read_from(&executable).is_none());
        std::fs::write(&response, "fixture-one\nfixture-two\n").unwrap();
        assert!(read_from(&executable).is_none());
    }
}
