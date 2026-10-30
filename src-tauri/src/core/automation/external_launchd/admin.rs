//! System jobs use one native authorization and one scoped root transaction.
use super::*;
use std::io::Write;

pub(super) enum Action<'a> {
    Save { bytes: &'a [u8], enabled: bool },
    Remove,
    Run,
}

pub(super) fn valid_label(label: &str) -> bool {
    !label.is_empty()
        && !label.starts_with('-')
        && !label.starts_with("com.apple.")
        && label
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
}

fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn script(
    snapshot: &Snapshot,
    operation: &str,
    enabled: bool,
    payload: &Path,
    digest: &str,
) -> Result<String, String> {
    let root = snapshot
        .path
        .parent()
        .ok_or("Missing system launchd scope")?;
    let domain_valid = if root == Path::new("/Library/LaunchDaemons") {
        snapshot.domain == "system"
    } else {
        root == Path::new("/Library/LaunchAgents")
            && snapshot
                .domain
                .strip_prefix("gui/")
                .is_some_and(|uid| uid.parse::<u32>().is_ok())
    };
    if !snapshot.requires_admin
        || !domain_valid
        || !valid_label(&snapshot.label)
        || snapshot.path.extension().and_then(|ext| ext.to_str()) != Some("plist")
    {
        return Err("Unsupported system launchd task scope or identity".into());
    }
    let bytes_digest = format!("{:x}", Sha256::digest(&snapshot.bytes));
    Ok(format!("set -Eeuo pipefail\npath={}\nroot={}\nlabel={}\ndomain={}\nexpected={}\nexpected_enabled={}\noperation={}\nenabled={}\npayload={}\npayload_digest={}\n{}",
        quote(&snapshot.path.to_string_lossy()), quote(&root.to_string_lossy()), quote(&snapshot.label), quote(&snapshot.domain), quote(&bytes_digest), snapshot.enabled, quote(operation), enabled, quote(&payload.to_string_lossy()), quote(digest), include_str!("admin.sh")))
}

pub(super) fn perform(snapshot: &Snapshot, action: Action<'_>) -> Result<(), String> {
    let mut payload = tempfile::NamedTempFile::new().map_err(|error| error.to_string())?;
    let (operation, enabled, digest) = match action {
        Action::Save { bytes, enabled } => {
            payload
                .write_all(bytes)
                .map_err(|error| error.to_string())?;
            payload.flush().map_err(|error| error.to_string())?;
            ("save", enabled, format!("{:x}", Sha256::digest(bytes)))
        }
        Action::Remove => ("remove", snapshot.enabled, String::new()),
        Action::Run => ("run", snapshot.enabled, String::new()),
    };
    super::super::process::authorize(&script(
        snapshot,
        operation,
        enabled,
        payload.path(),
        &digest,
    )?)
}

#[cfg(test)]
mod tests;
