//! The copy of `agent-hub-cli` that agents are told to run.
//!
//! The build wrapper explicitly stages the CLI as a Tauri sidecar, but
//! the desktop bundle is not a stable location an agent can discover.
//! On Linux the `.deb`/`.rpm` land it in `/usr/bin`, which is already on PATH;
//! on macOS it sits inside the `.app`, and on Windows inside the install
//! directory. Neither is on PATH, and putting it there is not ours to do:
//! `/usr/local/bin` needs an admin prompt, `~/.local/bin` is not on the default
//! macOS PATH at all, and Windows reserves symlink creation for administrators.
//!
//! So the app maintains its own copy at a fixed, predictable path instead, and
//! the `agent-hub-cli` skill looks there first. A copy, not a symlink: an
//! AppImage is mounted at a temporary path, and a `.app` the user drags
//! elsewhere would leave a dangling link.
//!
//! ## Why the stamp file
//!
//! The copy can fail — on Windows the old binary may be running (an agent
//! mid-command) or held by a virus scanner, and then the rename cannot replace
//! it. A stale bridge is not merely out of date: before #363 the deploy path
//! deleted a user's unmanaged directory outright, so an old binary can be one
//! that destroys data a new one refuses to touch. The database's own
//! `user_version` gate does not catch this, because such a fix carries no
//! schema change.
//!
//! The stamp is therefore written last and removed first. Its presence means
//! "a copy of exactly this version completed and ran"; its absence means the
//! bridge must not be used, whether or not a binary is sitting there. It is a
//! small text file, so it can still be removed when the locked binary cannot.

use anyhow::{bail, Context, Result};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;

use super::central_repo;

const BRIDGE_BIN_NAME: &str = if cfg!(windows) {
    "agent-hub-cli.exe"
} else {
    "agent-hub-cli"
};

/// Where the bridge lives. Deliberately the home directory rather than
/// `central_repo::base_dir()`: the library can be relocated to anywhere the
/// user likes, and the skill has to be able to name this path without asking.
/// Development build hooks may explicitly override it with AGENT_HUB_BRIDGE_DIR.
pub fn bridge_dir() -> PathBuf {
    std::env::var_os("AGENT_HUB_BRIDGE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| central_repo::home_base_dir().join("bin"))
}

/// Whether `name` is one of the files the bridge keeps in [`bridge_dir`].
pub(crate) fn is_bridge_file(name: &str) -> bool {
    name == BRIDGE_BIN_NAME || name == ".version" || name == format!(".{BRIDGE_BIN_NAME}.staged")
}

pub fn bridge_path() -> PathBuf {
    bridge_dir().join(BRIDGE_BIN_NAME)
}

/// Refuse a copy invalidated by an interrupted publication, even if the binary remains.
pub(crate) fn validated_path() -> Result<PathBuf> {
    let path = bridge_path();
    if read_stamp().as_deref() != Some(env!("CARGO_PKG_VERSION"))
        || !super::tool_detection::executable(&path)
    {
        bail!("AgentHub CLI bridge is unavailable or unverified; update the application before launching a terminal");
    }
    Ok(path)
}

fn stamp_path() -> PathBuf {
    bridge_dir().join(".version")
}

/// The CLI that shipped alongside the running app binary.
fn bundled_cli() -> Result<PathBuf> {
    let exe = std::env::current_exe().context("cannot locate the running executable")?;
    let dir = exe
        .parent()
        .context("the running executable has no parent directory")?;
    let candidate = dir.join(BRIDGE_BIN_NAME);
    if !candidate.is_file() {
        bail!(
            "this build does not ship {BRIDGE_BIN_NAME} next to the app binary ({})",
            dir.display()
        );
    }
    Ok(candidate)
}

/// An empty stamp counts as no stamp — that is how `invalidate_bridge` disables
/// a file it cannot delete. The skill's own check uses `-s` for the same reason.
fn read_stamp() -> Option<String> {
    std::fs::read_to_string(stamp_path())
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Make the current bridge untrusted before touching the binary.
///
/// A stamp that survives a failed republish is the one way the whole scheme
/// breaks: the old binary and its old stamp agree with each other, so nothing
/// downstream can tell they are stale. Three fallbacks, cheapest first, each
/// enough on its own to satisfy "an unstamped or absent binary is never run":
///
/// 1. unlink the stamp — the normal path;
/// 2. truncate it — a file that cannot be removed but can still be written
///    (the reader treats an empty stamp as no stamp);
/// 3. remove the binary itself — on Windows a locked or read-only `.version`
///    can defeat both of the above while the executable beside it is still
///    removable, and no binary is as good as no stamp.
///
/// If none of them works, the publish is abandoned rather than run with a
/// stamp that lies.
fn invalidate_bridge() -> Result<()> {
    let stamp = stamp_path();
    match std::fs::remove_file(&stamp) {
        Ok(()) => return Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => log::warn!("cli bridge: could not remove {}: {e}", stamp.display()),
    }
    if std::fs::write(&stamp, b"").is_ok() {
        return Ok(());
    }
    log::warn!("cli bridge: could not truncate {}", stamp.display());
    let binary = bridge_path();
    match std::fs::remove_file(&binary) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(anyhow::Error::new(e).context(format!(
            "cannot invalidate the published CLI: neither {} nor {} could be removed",
            stamp.display(),
            binary.display()
        ))),
    }
}

/// Build the command that runs the published CLI, without a console window.
///
/// The CLI is a console-subsystem binary and the app is not, so spawning it
/// plainly makes Windows open a console window for it — a black flash on the
/// first launch after every install (#413). Every other spawn in this crate
/// hides it the same way; a new one here has to as well.
fn cli_command(path: &Path) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(path);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

/// Run the freshly copied binary. A copy that cannot report its own version is
/// truncated, blocked, or built for another architecture — publishing it would
/// hand agents a binary that fails on first use.
fn verify(path: &Path, expected_version: &str) -> Result<()> {
    let output = cli_command(path)
        .arg("--version")
        .output()
        .with_context(|| format!("could not run {}", path.display()))?;
    if !output.status.success() {
        bail!("{} --version exited with {}", path.display(), output.status);
    }
    // Whole-token equality, not `contains`: 1.35.1 would otherwise accept a
    // binary reporting 1.35.10, and catching exactly that mismatch is the
    // reason this check exists.
    let reported = String::from_utf8_lossy(&output.stdout);
    let version = reported.split_whitespace().last().unwrap_or_default();
    if version != expected_version {
        bail!(
            "{} reports {:?}, expected version {expected_version}",
            path.display(),
            reported.trim()
        );
    }
    Ok(())
}

/// Publish the bundled CLI to the bridge path, replacing whatever is there.
///
/// Best-effort by contract: every failure leaves the stamp absent and is
/// logged, and the caller carries on. The app must start whether or not an
/// agent can drive it.
pub fn ensure_bridge(app_version: &str) {
    match publish_current(app_version) {
        Ok(path) => log::info!("cli bridge: ready at {}", path.display()),
        Err(e) => {
            // A missing sidecar or failed content check must not leave a
            // previously stamped, possibly incompatible CLI trusted by skills.
            if let Err(invalidate_error) = invalidate_bridge() {
                log::warn!("cli bridge: could not invalidate old copy: {invalidate_error:#}");
            }
            log::warn!("cli bridge: not available: {e:#}");
        }
    }
}

/// Publish the CLI next to this executable, including development build artifacts.
pub fn publish_current(app_version: &str) -> Result<PathBuf> {
    let source = bundled_cli()?;
    ensure_bridge_from(&source, app_version)
}

fn file_digest(path: &Path) -> Result<[u8; 32]> {
    let mut file = std::fs::File::open(path)?;
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 8192];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(digest.finalize().into())
}

fn ensure_bridge_from(source: &Path, app_version: &str) -> Result<PathBuf> {
    // Rebuilding with the same VERSION can change the CLI and its database
    // compatibility. A version-only fast path left an older binary stamped as
    // current, so compare the bundled and published bytes before trusting it.
    if read_stamp().as_deref() == Some(app_version)
        && bridge_path().is_file()
        && file_digest(source)? == file_digest(&bridge_path())?
    {
        return Ok(bridge_path());
    }
    publish_from(source, app_version)
}

fn publish_from(source: &Path, app_version: &str) -> Result<PathBuf> {
    let target = bridge_path();

    // From here the bridge is not to be trusted until the new copy lands.
    invalidate_bridge()?;

    let dir = bridge_dir();
    std::fs::create_dir_all(&dir).with_context(|| format!("could not create {}", dir.display()))?;

    // Copy beside the target so the rename stays on one filesystem.
    let staged = dir.join(format!(".{BRIDGE_BIN_NAME}.staged"));
    let _ = std::fs::remove_file(&staged);
    std::fs::copy(source, &staged).with_context(|| {
        format!(
            "could not copy {} to {}",
            source.display(),
            staged.display()
        )
    })?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&staged, std::fs::Permissions::from_mode(0o755))
            .context("could not make the staged CLI executable")?;
    }

    if let Err(e) = verify(&staged, app_version) {
        let _ = std::fs::remove_file(&staged);
        return Err(e);
    }

    // On Windows this fails while the old binary is running or held open by a
    // scanner. That is the case the stamp exists for: the stale binary stays,
    // unusable, rather than being silently presented as current.
    rename_retrying_sharing_violation(&staged, &target)
        .with_context(|| format!("could not replace {} (it may be in use)", target.display()))?;

    std::fs::write(stamp_path(), app_version)
        .with_context(|| format!("could not write {}", stamp_path().display()))?;

    log::info!(
        "cli bridge: published {app_version} to {}",
        target.display()
    );
    Ok(target)
}

/// #487: right after `verify` ran the staged exe, Windows can still hold it
/// for a moment (scanners inspect a freshly executed binary), so the rename
/// fails with a sharing violation. Wait that out, ~2 s at most; any other
/// error, or a lock that outlasts it, is reported as before.
fn rename_retrying_sharing_violation(from: &Path, to: &Path) -> std::io::Result<()> {
    const ERROR_SHARING_VIOLATION: i32 = 32;
    let mut attempts = 0;
    loop {
        match std::fs::rename(from, to) {
            Err(e)
                if cfg!(windows)
                    && e.raw_os_error() == Some(ERROR_SHARING_VIOLATION)
                    && attempts < 10 =>
            {
                attempts += 1;
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
            result => return result,
        }
    }
}

#[cfg(test)]
mod tests;
