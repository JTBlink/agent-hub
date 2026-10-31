pub(super) use crate::core::cli_process::{command, command_with_timeout, read_command};

/// Reuse the native macOS authorization prompt for narrowly scoped system changes.
pub(super) fn authorize(script: &str) -> Result<(), String> {
    if !cfg!(target_os = "macos") {
        return Err("Administrator setup requires macOS".into());
    }
    let shell = format!("/bin/bash -c '{}'", script.replace('\'', "'\\''"));
    let apple = format!(
        "do shell script \"{}\" with administrator privileges",
        shell
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
    );
    command_with_timeout("/usr/bin/osascript", &["-e", &apple], &[], 300).map(|_| ())
}
