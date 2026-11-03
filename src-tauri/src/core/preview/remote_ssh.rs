//! Shared SSH alias validation and non-interactive authentication policy.
use crate::core::error::AppError;
pub(super) fn validate_target(target: &str) -> Result<(), AppError> {
    if target.is_empty()
        || target.len() > 255
        || target.starts_with('-')
        || !target
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._-@".contains(&c))
        || target.matches('@').count() > 1
        || target.starts_with('@')
        || target.ends_with('@')
    {
        return Err(AppError::invalid_input(
            "Use an SSH host alias or user@host without options or a path",
        ));
    }
    Ok(())
}
pub(super) fn secure_options(command: &mut std::process::Command) {
    command.env("LC_ALL", "C");
    for option in [
        "BatchMode=yes",
        "StrictHostKeyChecking=yes",
        "ForwardAgent=no",
        "ClearAllForwardings=yes",
        "PermitLocalCommand=no",
        "RemoteCommand=none",
        "ConnectTimeout=10",
        "ServerAliveInterval=5",
        "ServerAliveCountMax=2",
    ] {
        command.args(["-o", option]);
    }
}
