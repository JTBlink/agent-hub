mod history;
mod local_state;
pub use history::list_snapshot_versions;
mod status;
pub use status::{get_file_diff, get_status, GitBackupFileDiff, GitBackupStatus};
mod restore;
use anyhow::{Context, Result};
use chrono::Utc;
pub(crate) use restore::clone_into_unlocked;
use std::path::Path;
use std::process::Command;

use super::git2_engine;
use super::git_credentials;
use super::merge::protocol;
use super::repo_lock::RepoLock;

/// Create a `Command` for git that hides the console window on Windows.
fn git_command() -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new("git");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct GitBackupVersion {
    /// Restore reference: snapshot tag, or full commit ID for automatic backups.
    pub tag: String,
    /// Commit SHA this snapshot points to (short)
    pub commit: String,
    /// Commit message at this snapshot
    pub message: String,
    /// Commit timestamp (ISO 8601)
    pub committed_at: String,
    /// Commit author name — the device name of the machine that made this
    /// backup (§4.3). Empty for commits from before device naming existed.
    pub author: String,
}

/// Default device name derived from the machine's hostname (macOS appends
/// `.local`, which is noise for a display name).
pub fn default_device_name() -> String {
    let host = gethostname::gethostname().to_string_lossy().to_string();
    let host = host
        .strip_suffix(".local")
        .unwrap_or(&host)
        .trim()
        .to_string();
    if host.is_empty() {
        "My Computer".to_string()
    } else {
        host
    }
}

/// Normalize a user-entered device name into something safe to use as a git
/// author name: no control characters or `<`/`>` (git's ident syntax), single
/// spaces, at most 64 characters. May return an empty string — callers fall
/// back to `default_device_name()`.
pub fn sanitize_device_name(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .filter(|c| !c.is_control() && *c != '<' && *c != '>')
        .collect();
    cleaned
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(64)
        .collect::<String>()
        .trim_end()
        .to_string()
}

/// Synthetic per-device author email: an ASCII slug of the device name at a
/// reserved domain. Only used to make `git log`/shortlog distinguish devices;
/// it never has to be routable.
fn device_email(device_name: &str) -> String {
    let mut slug = String::new();
    for c in device_name.chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c.to_ascii_lowercase());
        } else if !slug.ends_with('-') && !slug.is_empty() {
            slug.push('-');
        }
    }
    let slug = slug.trim_matches('-');
    let slug = if slug.is_empty() { "device" } else { slug };
    format!("{slug}@agent-hub.local")
}

/// Write the device name into the repo-local git identity (§4.3: device name
/// = commit author). Everything that commits in this repo afterwards — manual
/// backups, merge commits from sync, restore commits, future auto-backup —
/// carries the device name, and machines without a global git identity can
/// commit at all. Idempotent; no-op when the repo doesn't exist or the name
/// is empty.
pub fn configure_device_identity(skills_dir: &Path, device_name: &str) -> Result<()> {
    if device_name.trim().is_empty() || !skills_dir.join(".git").exists() {
        return Ok(());
    }
    let email = device_email(device_name);
    let current_name = run_git(skills_dir, &["config", "--local", "--get", "user.name"]).ok();
    let current_email = run_git(skills_dir, &["config", "--local", "--get", "user.email"]).ok();
    if current_name.as_deref() != Some(device_name) {
        run_git_checked(skills_dir, &["config", "user.name", device_name])?;
    }
    if current_email.as_deref() != Some(email.as_str()) {
        run_git_checked(skills_dir, &["config", "user.email", &email])?;
    }
    Ok(())
}

/// Fetch from the remote without modifying the working tree.
/// This is best-effort so status refresh still works while offline.
pub fn fetch_remote(skills_dir: &Path) -> Result<()> {
    if !skills_dir.join(".git").exists() {
        return Ok(());
    }
    if run_git(skills_dir, &["remote", "get-url", "origin"]).is_err() {
        return Ok(());
    }

    let branch = run_git(skills_dir, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "main".to_string());
    if let Some(url) = raw_remote_url(skills_dir).filter(|u| git2_engine::applies_to(u)) {
        if let Err(e) = git2_engine::fetch(skills_dir, Some(&branch), &url) {
            log::warn!("git fetch (git2, best-effort): {e:#}");
        }
        return Ok(());
    }
    let env = remote_credential_env(skills_dir);
    let _ = run_git_env(skills_dir, &["fetch", "--quiet", "origin", &branch], &env);
    Ok(())
}

/// The raw (unredacted) origin URL, for credential lookup and rewriting.
/// Never log or surface this value directly — it may embed a token on
/// not-yet-migrated repos.
pub(crate) fn raw_remote_url(skills_dir: &Path) -> Option<String> {
    run_git(skills_dir, &["remote", "get-url", "origin"]).ok()
}

/// Credential-injection environment for git subprocesses talking to origin.
fn remote_credential_env(skills_dir: &Path) -> Vec<(String, String)> {
    raw_remote_url(skills_dir)
        .map(|url| git_credentials::credential_env_for_url(&url))
        .unwrap_or_default()
}

/// Detect how the local repo relates to the configured remote.
/// Returns one of: "healthy", "no_remote", "no_upstream", "unrelated_histories", "detached".
fn detect_upstream_health(dir: &Path, has_remote: bool) -> String {
    if !has_remote {
        return "no_remote".to_string();
    }
    if run_git(dir, &["symbolic-ref", "-q", "HEAD"]).is_err() {
        return "detached".to_string();
    }
    if run_git(dir, &["rev-parse", "--abbrev-ref", "@{upstream}"]).is_err() {
        return "no_upstream".to_string();
    }
    if run_git(dir, &["merge-base", "HEAD", "@{upstream}"]).is_err() {
        return "unrelated_histories".to_string();
    }
    "healthy".to_string()
}

/// Initialize a new git repository in the skills directory.
#[allow(dead_code)]
pub fn init_repo(skills_dir: &Path, device_name: &str) -> Result<()> {
    let _lock = RepoLock::acquire_foreground("git init")?;
    init_repo_unlocked(skills_dir, device_name)
}

pub(crate) fn init_repo_unlocked(skills_dir: &Path, device_name: &str) -> Result<()> {
    if skills_dir.join(".git").exists() {
        anyhow::bail!("Already a git repository");
    }

    // Pin the classic ref format: libgit2 cannot open reftable repositories,
    // and the user's git may default to it via config or the environment.
    let output = git_command()
        .args(["-c", "init.defaultRefFormat=files", "init"])
        .env_remove("GIT_DEFAULT_REF_FORMAT")
        .current_dir(skills_dir)
        .output()?;
    if !output.status.success() {
        anyhow::bail!(
            "git init failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    run_git_checked(skills_dir, &["checkout", "-b", "main"])?;

    // Identity must exist before the initial commit: on machines without a
    // global git identity the commit would otherwise fail outright.
    configure_device_identity(skills_dir, device_name)?;

    ensure_gitignore(skills_dir)?;
    // Cleanup, not a precondition: a failure here means the backup carries a few
    // stale `.pyc` entries, which is not a reason to refuse to back up at all.
    if let Err(e) = untrack_python_artifacts(skills_dir) {
        log::warn!("backup: could not untrack compiled-Python artifacts (continuing): {e:#}");
    }
    // §3.6: a pre-existing oversized skill must not slip into the very first
    // commit — once tracked it can never be excluded again.
    if let Err(e) = apply_oversized_exclusions(skills_dir, SKILL_SIZE_LIMIT_BYTES) {
        log::warn!("backup size: exclusion scan failed (continuing): {e:#}");
    }
    protocol::ensure_protocol_file(skills_dir)?;

    // Initial commit
    run_git_checked(skills_dir, &["add", "-A"])?;
    run_git_checked(
        skills_dir,
        &[
            "commit",
            "-m",
            &protocol::app_commit_message("Initial skill library snapshot"),
        ],
    )?;

    log::info!("git init: initialized repository on branch main");
    Ok(())
}

/// Set (or update) the remote origin URL.
pub fn set_remote(skills_dir: &Path, url: &str) -> Result<()> {
    let _lock = RepoLock::acquire_foreground("git set remote")?;
    set_remote_unlocked(skills_dir, url)
}

pub(crate) fn set_remote_unlocked(skills_dir: &Path, url: &str) -> Result<()> {
    ensure_repo(skills_dir)?;

    let has_remote = run_git(skills_dir, &["remote", "get-url", "origin"]).is_ok();
    if has_remote {
        run_git_checked(skills_dir, &["remote", "set-url", "origin", url])?;
    } else {
        run_git_checked(skills_dir, &["remote", "add", "origin", url])?;
    }

    // Fetch remote to set up tracking
    if git2_engine::applies_to(url) {
        if let Err(e) = git2_engine::fetch(skills_dir, None, url) {
            log::warn!("git set_remote: initial fetch failed (continuing): {e:#}");
        }
    } else {
        let env = remote_credential_env(skills_dir);
        if let Err(e) = run_git_env(skills_dir, &["fetch", "origin"], &env) {
            log::warn!("git set_remote: initial fetch failed (continuing): {e}");
        }
    }

    // Set upstream tracking if branch exists on remote
    let branch = run_git(skills_dir, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "main".to_string());
    let _ = run_git(
        skills_dir,
        &[
            "branch",
            "--set-upstream-to",
            &format!("origin/{}", branch),
            &branch,
        ],
    );

    // Whether tracking got established decides the whole sync path: with no
    // upstream the first push must use `-u` and the "ahead" count reads 0.
    // Logging it here is what makes "Sync says up to date but remote is empty"
    // diagnosable from a single log line.
    let upstream_tracking =
        run_git(skills_dir, &["rev-parse", "--abbrev-ref", "@{upstream}"]).is_ok();
    log::info!("git set_remote: origin configured on branch {branch}, upstream_tracking={upstream_tracking}");

    Ok(())
}

/// Rewrite the origin URL without fetching or touching upstream tracking.
/// Used by credential migration, which controls the verify step separately.
pub(crate) fn set_remote_url_only(skills_dir: &Path, url: &str) -> Result<()> {
    ensure_repo(skills_dir)?;
    if run_git(skills_dir, &["remote", "get-url", "origin"]).is_ok() {
        run_git_checked(skills_dir, &["remote", "set-url", "origin", url])
    } else {
        run_git_checked(skills_dir, &["remote", "add", "origin", url])
    }
}

/// Cheap network round-trip proving we can authenticate against origin.
pub(crate) fn verify_remote_auth(skills_dir: &Path) -> Result<()> {
    if let Some(url) = raw_remote_url(skills_dir).filter(|u| git2_engine::applies_to(u)) {
        return git2_engine::ls_remote_refs(&url).map(|_| ());
    }
    let env = remote_credential_env(skills_dir);
    run_git_env(skills_dir, &["ls-remote", "--heads", "origin"], &env).map(|_| ())
}

/// Whether a remote (addressed by URL, no local repo needed) has any branch.
/// Uses stored keychain credentials via askpass when available. Distinguishes
/// "freshly created empty repository" from "existing backup to restore".
pub fn remote_has_heads(url: &str) -> Result<bool> {
    if git2_engine::applies_to(url) {
        let refs = git2_engine::ls_remote_refs(url)?;
        return Ok(refs.iter().any(|r| r.starts_with("refs/heads/")));
    }
    let env = git_credentials::credential_env_for_url(url);
    let output = git_command()
        .args(["ls-remote", "--heads"])
        .arg(url)
        .envs(env.iter().map(|(k, v)| (k.as_str(), v.as_str())))
        .output()
        .context("Failed to run git command")?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!(
            "git ls-remote failed: {}",
            redact_urls_in_text(stderr.trim())
        );
    }
    Ok(!String::from_utf8_lossy(&output.stdout).trim().is_empty())
}

/// Remove the remote origin. Idempotent: succeeds when the repo or the
/// remote does not exist, so a retry after a partial disconnect converges.
/// Local repository and remote data are untouched.
pub fn remove_remote(skills_dir: &Path) -> Result<()> {
    let _lock = RepoLock::acquire_foreground("git remove remote")?;
    remove_remote_unlocked(skills_dir)
}

fn remove_remote_unlocked(skills_dir: &Path) -> Result<()> {
    if run_git(skills_dir, &["remote", "get-url", "origin"]).is_err() {
        return Ok(());
    }
    run_git_checked(skills_dir, &["remote", "remove", "origin"])?;
    log::info!("git remove_remote: origin removed");
    Ok(())
}

/// Whether the working tree has any uncommitted change (staged, unstaged or
/// untracked). Cheap porcelain probe used by the auto-backup round.
pub(crate) fn has_uncommitted_changes(skills_dir: &Path) -> Result<bool> {
    Ok(!run_git(skills_dir, &["status", "--porcelain"])?.is_empty())
}

/// Stage all changes and create a commit.
#[allow(dead_code)]
pub fn commit_all(skills_dir: &Path, message: &str) -> Result<()> {
    let _lock = RepoLock::acquire_foreground("git commit")?;
    commit_all_unlocked(skills_dir, message)
}

pub(crate) fn commit_all_unlocked(skills_dir: &Path, message: &str) -> Result<()> {
    ensure_repo(skills_dir)?;
    ensure_gitignore(skills_dir)?;
    // Cleanup, not a precondition: a failure here means the backup carries a few
    // stale `.pyc` entries, which is not a reason to refuse to back up at all.
    if let Err(e) = untrack_python_artifacts(skills_dir) {
        log::warn!("backup: could not untrack compiled-Python artifacts (continuing): {e:#}");
    }
    // Atomic-write leftovers must never enter a commit: a committed
    // `x.json.tmp.<uuid>` trips the merge validator on every other device.
    // (Reconcile also cleans these, but a machine that only ever pushes
    // never reconciles.)
    remove_tmp_metadata_files(skills_dir);
    // §3.6: new oversized skills stay local, out of the backup.
    if let Err(e) = apply_oversized_exclusions(skills_dir, SKILL_SIZE_LIMIT_BYTES) {
        log::warn!("backup size: exclusion scan failed (continuing): {e:#}");
    }
    // app_commit (§6): protocol marker is sticky in the tree and the message
    // carries the protocol trailer.
    protocol::ensure_protocol_file(skills_dir)?;

    run_git_checked(skills_dir, &["add", "-A"])?;

    // Check if there's anything to commit
    let status = run_git(skills_dir, &["status", "--porcelain"])?;
    if status.is_empty() {
        log::info!("git commit: working tree clean, nothing to commit");
        anyhow::bail!("Nothing to commit");
    }

    run_git_checked(
        skills_dir,
        &["commit", "-m", &protocol::app_commit_message(message)],
    )?;
    log::info!("git commit: committed staged changes");
    Ok(())
}

const AUTO_COMMIT_MAX_NAMES: usize = 5;

pub(crate) fn build_auto_commit_message(porcelain: &str) -> String {
    let mut skills = std::collections::BTreeSet::new();
    let mut automations = std::collections::BTreeSet::new();
    let mut has_metadata = false;
    for line in porcelain.lines() {
        let entry = line.get(3..).unwrap_or("").trim();
        if entry.is_empty() {
            continue;
        }
        let path = entry.split(" -> ").last().unwrap_or(entry);
        if let Some(rest) = path.strip_prefix("skills/") {
            if let Some((name, _)) = rest.split_once('/') {
                if !name.starts_with('.') {
                    skills.insert(name.to_string());
                    continue;
                }
            }
        }
        if let Some(rest) = path.strip_prefix("automations/") {
            if let Some((name, _)) = rest.split_once('/') {
                if !name.starts_with('.') {
                    automations.insert(name.to_string());
                    continue;
                }
            }
        }
        has_metadata = true;
    }
    if skills.is_empty() && automations.is_empty() && !has_metadata {
        return "auto backup".to_string();
    }
    let mut parts: Vec<String> = skills.into_iter().collect();
    parts.extend(
        automations
            .into_iter()
            .map(|name| format!("automation/{name}")),
    );
    let overflow = if parts.len() > AUTO_COMMIT_MAX_NAMES {
        let n = parts.len() - AUTO_COMMIT_MAX_NAMES;
        parts.truncate(AUTO_COMMIT_MAX_NAMES);
        Some(n)
    } else {
        None
    };
    if has_metadata {
        parts.push("metadata".into());
    }
    let mut msg = format!("auto backup: {}", parts.join(", "));
    if let Some(n) = overflow {
        msg.push_str(&format!(" (+{n} more)"));
    }
    msg
}

pub(crate) fn commit_all_auto_unlocked(skills_dir: &Path) -> Result<()> {
    ensure_repo(skills_dir)?;
    ensure_gitignore(skills_dir)?;
    if let Err(e) = untrack_python_artifacts(skills_dir) {
        log::warn!("backup: could not untrack compiled-Python artifacts (continuing): {e:#}");
    }
    remove_tmp_metadata_files(skills_dir);
    if let Err(e) = apply_oversized_exclusions(skills_dir, SKILL_SIZE_LIMIT_BYTES) {
        log::warn!("backup size: exclusion scan failed (continuing): {e:#}");
    }
    protocol::ensure_protocol_file(skills_dir)?;

    run_git_checked(skills_dir, &["add", "-A"])?;

    let status = run_git(skills_dir, &["status", "--porcelain"])?;
    if status.is_empty() {
        log::info!("git commit: working tree clean, nothing to commit");
        anyhow::bail!("Nothing to commit");
    }

    let message = build_auto_commit_message(&status);
    run_git_checked(
        skills_dir,
        &["commit", "-m", &protocol::app_commit_message(&message)],
    )?;
    log::info!("git commit: {message}");
    Ok(())
}

/// Delete `refs/agent-hub/*` copies that a mirror / push-all style
/// operation uploaded to the remote (merge-engine design §11-2). The app's
/// own push never sends them; this cleans up after manual advanced git use.
/// Local refs under the namespace are functional (conflict pins, recovery
/// anchors) and stay untouched. Returns the number of remote refs removed.
pub fn prune_hidden_refs_on_remote(skills_dir: &Path) -> Result<usize> {
    ensure_repo(skills_dir)?;
    const HIDDEN_PREFIX: &str = "refs/agent-hub/";

    if let Some(url) = raw_remote_url(skills_dir).filter(|u| git2_engine::applies_to(u)) {
        let refs: Vec<String> = git2_engine::ls_remote_refs(&url)?
            .into_iter()
            .filter(|r| r.starts_with(HIDDEN_PREFIX))
            .collect();
        if refs.is_empty() {
            return Ok(0);
        }
        let refspecs: Vec<String> = refs.iter().map(|r| format!(":{r}")).collect();
        git2_engine::push_refs(skills_dir, &refspecs, &url)?;
        log::info!(
            "git prune hidden refs (git2): removed {} remote ref(s)",
            refs.len()
        );
        return Ok(refs.len());
    }

    let env = remote_credential_env(skills_dir);
    let listed = run_git_env(
        skills_dir,
        &["ls-remote", "origin", &format!("{HIDDEN_PREFIX}*")],
        &env,
    )?;
    let refspecs: Vec<String> = listed
        .lines()
        .filter_map(|line| line.split_whitespace().nth(1))
        .filter(|r| r.starts_with(HIDDEN_PREFIX))
        .map(|r| format!(":{r}"))
        .collect();
    if refspecs.is_empty() {
        return Ok(0);
    }
    let mut args: Vec<&str> = vec!["push", "origin"];
    args.extend(refspecs.iter().map(String::as_str));
    run_git_env_checked(skills_dir, &args, &env)?;
    log::info!(
        "git prune hidden refs: removed {} remote ref(s)",
        refspecs.len()
    );
    Ok(refspecs.len())
}

/// Commit for a conflict resolution (merge-engine design §4): the message
/// arrives with its trailers already built (protocol + Resolved), and the
/// commit may be empty — "keep local" changes nothing in the tree yet must
/// still record the resolution for other devices.
pub(crate) fn commit_resolution_unlocked(skills_dir: &Path, full_message: &str) -> Result<()> {
    ensure_repo(skills_dir)?;
    ensure_gitignore(skills_dir)?;
    // Cleanup, not a precondition: a failure here means the backup carries a few
    // stale `.pyc` entries, which is not a reason to refuse to back up at all.
    if let Err(e) = untrack_python_artifacts(skills_dir) {
        log::warn!("backup: could not untrack compiled-Python artifacts (continuing): {e:#}");
    }
    remove_tmp_metadata_files(skills_dir);
    if let Err(e) = apply_oversized_exclusions(skills_dir, SKILL_SIZE_LIMIT_BYTES) {
        log::warn!("backup size: exclusion scan failed (continuing): {e:#}");
    }
    protocol::ensure_protocol_file(skills_dir)?;
    run_git_checked(skills_dir, &["add", "-A"])?;
    run_git_checked(skills_dir, &["commit", "--allow-empty", "-m", full_message])?;
    Ok(())
}

/// Push to the remote repository.
pub fn push(skills_dir: &Path) -> Result<()> {
    let _lock = RepoLock::acquire_foreground("git push")?;
    push_unlocked(skills_dir)
}

pub(crate) fn push_unlocked(skills_dir: &Path) -> Result<()> {
    ensure_repo(skills_dir)?;

    let branch = run_git(skills_dir, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "main".to_string());
    log::info!("git push: starting on branch {branch}");

    if let Some(url) = raw_remote_url(skills_dir).filter(|u| git2_engine::applies_to(u)) {
        return push_via_git2(skills_dir, &branch, &url);
    }

    let env = remote_credential_env(skills_dir);

    // Push branch first; if no upstream, set it.
    let result = run_git_env(skills_dir, &["push"], &env);
    if result.is_err() {
        log::info!("git push: no upstream tracking, retrying with -u origin {branch}");
        run_git_env_checked(skills_dir, &["push", "-u", "origin", &branch], &env)?;
    }

    // Snapshot tags are lightweight (by design), so `--follow-tags` will not include them.
    // Push only missing snapshot tags in a single network round-trip.
    let local_snapshot_tags: Vec<String> = run_git(skills_dir, &["tag", "--list", "sm-v-*"])?
        .lines()
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string())
        .collect();

    if !local_snapshot_tags.is_empty() {
        let remote_snapshot_tags_raw = run_git_env(
            skills_dir,
            &["ls-remote", "--tags", "--refs", "origin", "sm-v-*"],
            &env,
        )
        .unwrap_or_default();

        let remote_snapshot_tags: std::collections::HashSet<String> = remote_snapshot_tags_raw
            .lines()
            .filter_map(|line| line.split_whitespace().nth(1))
            .filter_map(|ref_name| ref_name.strip_prefix("refs/tags/"))
            .map(|tag| tag.to_string())
            .collect();

        let missing_tag_refs: Vec<String> = local_snapshot_tags
            .into_iter()
            .filter(|tag| !remote_snapshot_tags.contains(tag))
            .map(|tag| format!("refs/tags/{tag}"))
            .collect();

        if !missing_tag_refs.is_empty() {
            let mut cmd = git_command();
            cmd.arg("-C").arg(skills_dir).arg("push").arg("origin");
            cmd.args(&missing_tag_refs);
            cmd.envs(env.iter().map(|(k, v)| (k.as_str(), v.as_str())));
            let pushed = missing_tag_refs.len();
            let output = cmd.output().context("Failed to run git command")?;
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                let redacted = redact_urls_in_text(&stderr);
                log::warn!("git push: snapshot tag push failed: {redacted}");
                anyhow::bail!("git command failed: {}", redacted);
            }
            log::info!("git push: pushed {pushed} snapshot tag(s)");
        }
    }

    log::info!("git push: done");
    Ok(())
}

/// git2-engine variant of `push_unlocked`: branch first, then any snapshot
/// tags the remote is missing. Mirrors the system-git path's semantics,
/// including treating a failed remote-tag listing as "push all tags"
/// (re-pushing an existing identical tag is a no-op).
fn push_via_git2(skills_dir: &Path, branch: &str, url: &str) -> Result<()> {
    git2_engine::push_refs(
        skills_dir,
        &[format!("refs/heads/{branch}:refs/heads/{branch}")],
        url,
    )?;
    // Idempotent; makes ahead/behind and upstream-health work after the
    // first push, mirroring `push -u`.
    let _ = run_git(
        skills_dir,
        &[
            "branch",
            "--set-upstream-to",
            &format!("origin/{branch}"),
            branch,
        ],
    );

    let local_snapshot_tags: Vec<String> = run_git(skills_dir, &["tag", "--list", "sm-v-*"])?
        .lines()
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string())
        .collect();

    if !local_snapshot_tags.is_empty() {
        let remote_snapshot_tags: std::collections::HashSet<String> =
            git2_engine::ls_remote_refs(url)
                .unwrap_or_default()
                .into_iter()
                .filter_map(|r| r.strip_prefix("refs/tags/").map(|t| t.to_string()))
                .filter(|t| t.starts_with("sm-v-"))
                .collect();

        let missing_tag_refs: Vec<String> = local_snapshot_tags
            .into_iter()
            .filter(|tag| !remote_snapshot_tags.contains(tag))
            .map(|tag| format!("refs/tags/{tag}:refs/tags/{tag}"))
            .collect();

        if !missing_tag_refs.is_empty() {
            let pushed = missing_tag_refs.len();
            git2_engine::push_refs(skills_dir, &missing_tag_refs, url)?;
            log::info!("git push (git2): pushed {pushed} snapshot tag(s)");
        }
    }

    log::info!("git push (git2): done");
    Ok(())
}

/// Pull from the remote repository.
#[allow(dead_code)]
pub fn pull(skills_dir: &Path) -> Result<()> {
    let _lock = RepoLock::acquire_foreground("git pull")?;
    pull_unlocked(skills_dir)
}

pub(crate) fn pull_unlocked(skills_dir: &Path) -> Result<()> {
    ensure_repo(skills_dir)?;
    ensure_no_interrupted_git_operation(skills_dir)?;
    let branch = current_branch(skills_dir);
    log::info!("git pull: fetch + merge origin/{branch}");
    fetch_branch(skills_dir, &branch)?;
    merge_branch_system(skills_dir, &branch)?;
    log::info!("git pull: done");
    Ok(())
}

pub(crate) fn current_branch(skills_dir: &Path) -> String {
    run_git(skills_dir, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "main".to_string())
}

/// Fetch one branch from origin through whichever network engine applies.
pub(crate) fn fetch_branch(skills_dir: &Path, branch: &str) -> Result<()> {
    if let Some(url) = raw_remote_url(skills_dir).filter(|u| git2_engine::applies_to(u)) {
        git2_engine::fetch(skills_dir, Some(branch), &url)
    } else {
        let env = remote_credential_env(skills_dir);
        run_git_env_checked(skills_dir, &["fetch", "origin", branch], &env)
    }
}

/// Line-level merge of the already-fetched remote branch via system git —
/// used by the `merge_engine=system` escape hatch and as the legacy fallback
/// of the object engine (merge-engine design §6).
///
/// The merge commit carries the protocol trailer (`app_commit`): without it,
/// this app's own line merge would read as an old-client double-parent
/// violation on every other device and block their object merges. A
/// conflict-free line merge preserves both sides' file-level changes (the
/// conflicting case aborts below), and every later object merge re-validates
/// its own output (§7), so trusting our own stamped line merges is sound.
pub(crate) fn merge_branch_system(skills_dir: &Path, branch: &str) -> Result<()> {
    let message = protocol::app_commit_message("sync: merge remote skill changes (line merge)");
    if let Err(e) = run_git(
        skills_dir,
        &["merge", "-m", &message, &format!("origin/{branch}")],
    ) {
        // A failed merge — almost always a content conflict on a SKILL.md body
        // edited on two machines — leaves the working tree conflicted with
        // MERGE_HEAD behind, which `ensure_no_interrupted_git_operation` would
        // then treat as a hard block on every future sync. Abort to restore a
        // clean tree, and surface a recognizable conflict error so the UI can
        // route the user to recovery (re-clone) instead of leaving them stuck.
        log::warn!("git pull: merge failed, aborting to clear conflicted state: {e}");
        let _ = run_git(skills_dir, &["merge", "--abort"]);
        anyhow::bail!("SYNC_CONFLICT: local and remote skill changes conflict ({e})");
    }
    Ok(())
}

/// Create an annotated snapshot tag on current HEAD.
pub fn create_snapshot_tag(skills_dir: &Path) -> Result<String> {
    let _lock = RepoLock::acquire_foreground("git snapshot")?;
    create_snapshot_tag_unlocked(skills_dir)
}

pub(crate) fn create_snapshot_tag_unlocked(skills_dir: &Path) -> Result<String> {
    ensure_repo(skills_dir)?;

    // Reuse an existing snapshot tag on HEAD to avoid duplicate history entries
    // when a previous sync created a tag but push failed.
    let existing_on_head = run_git(
        skills_dir,
        &[
            "tag",
            "--points-at",
            "HEAD",
            "--list",
            "sm-v-*",
            "--sort=-creatordate",
        ],
    )?;
    if let Some(tag) = existing_on_head
        .lines()
        .find(|line| !line.trim().is_empty())
    {
        let tag = tag.trim().to_string();
        log::info!("git snapshot: reusing existing tag {tag} on HEAD");
        return Ok(tag);
    }

    let short_sha = run_git(skills_dir, &["rev-parse", "--short", "HEAD"])?;
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let mut tag = format!("sm-v-{}-{}", timestamp, short_sha);

    // Avoid collision when multiple snapshots happen within the same second.
    if run_git(
        skills_dir,
        &["rev-parse", "-q", "--verify", &format!("refs/tags/{tag}")],
    )
    .is_ok()
    {
        let millis = Utc::now().timestamp_subsec_millis();
        tag = format!("sm-v-{}-{:03}-{}", timestamp, millis, short_sha);
    }

    // Use lightweight tag to avoid requiring git user.name/user.email on client machines.
    run_git_checked(skills_dir, &["tag", &tag])?;
    log::info!("git snapshot: created tag {tag}");
    Ok(tag)
}

/// Restore skills files to a snapshot tag by creating a new restore commit.
/// Returns the safety-point tag capturing the pre-restore state.
#[allow(dead_code)]
pub fn restore_snapshot_version(skills_dir: &Path, tag: &str) -> Result<String> {
    let _lock = RepoLock::acquire_foreground("git restore snapshot")?;
    restore_snapshot_version_unlocked(skills_dir, tag)
}

pub(crate) fn restore_snapshot_version_unlocked(skills_dir: &Path, tag: &str) -> Result<String> {
    ensure_repo(skills_dir)?;

    let target = history::restore_target(skills_dir, tag)?;

    log::info!("git restore: switching skills library to {tag}");

    // Safety point first (§3.5): the pre-restore state — including any
    // uncommitted edits — becomes a user-visible snapshot the user can return
    // to from the backup history. This is what makes restore always undoable.
    let status = run_git(skills_dir, &["status", "--porcelain"])?;
    if !status.is_empty() {
        commit_all_unlocked(skills_dir, "backup before restore")?;
    }
    let safety_tag = create_snapshot_tag_unlocked(skills_dir)?;

    let restore_result: Result<()> = (|| {
        // Align working tree + index to snapshot tree exactly (including deletions),
        // then commit as a forward change.
        run_git_checked(skills_dir, &["read-tree", "--reset", "-u", &target])?;

        // Sticky protocol marker (§6): a pre-protocol snapshot self-heals on
        // the restore commit instead of resurrecting a marker-less tree.
        protocol::ensure_protocol_file(skills_dir)?;
        ensure_gitignore(skills_dir)?;
        // The snapshot's .gitignore predates the managed oversized section —
        // rebuild it before add -A, or a locally-kept oversized skill would
        // ride into the restore commit.
        if let Err(e) = apply_oversized_exclusions(skills_dir, SKILL_SIZE_LIMIT_BYTES) {
            log::warn!("backup size: exclusion scan failed (continuing): {e:#}");
        }
        run_git_checked(skills_dir, &["add", "-A"])?;

        let changed = run_git(skills_dir, &["status", "--porcelain"])?;
        if !changed.is_empty() {
            run_git_checked(
                skills_dir,
                &[
                    "commit",
                    "-m",
                    &protocol::app_commit_message(&format!(
                        "restore: switch skills library to {}",
                        tag
                    )),
                ],
            )?;
        }
        Ok(())
    })();

    match restore_result {
        Ok(()) => {
            log::info!("git restore: completed restore to {tag} (safety point {safety_tag})");
            Ok(safety_tag)
        }
        Err(err) => {
            // Best-effort rollback to the safety point (pre-restore HEAD).
            let _ = run_git_checked(skills_dir, &["read-tree", "--reset", "-u", &safety_tag]);
            Err(err)
                .context("Restore failed after mutating working tree; attempted automatic rollback")
        }
    }
}

/// Clone a remote repository into the skills directory.
/// The skills directory must be empty or non-existent.
#[allow(dead_code)]
pub fn clone_into(skills_dir: &Path, url: &str) -> Result<()> {
    let _lock = RepoLock::acquire_foreground("git clone")?;
    clone_into_unlocked(skills_dir, url)
}

/// Clone variant that refuses to merge a populated non-git directory into the
/// cloned repo. Used by agent-facing entry points (e.g. CLI `--skills-root`)
/// where an accidental pointing at an unrelated populated directory would
/// otherwise silently absorb its contents.
///
/// The check runs inside the same `RepoLock` as the clone, so any other
/// agent-hub process attempting to populate the target between check
/// and clone is serialized.
pub fn clone_into_strict(skills_dir: &Path, url: &str) -> Result<()> {
    let _lock = RepoLock::acquire_foreground("git clone")?;
    ensure_clean_clone_target(skills_dir)?;
    clone_into_unlocked(skills_dir, url)
}

/// Refuse a clone target that is a file, or a non-empty directory that is not
/// already a git repo. An empty or non-existent target is fine, and an
/// existing `.git` is left to `clone_into_unlocked` to reject with its own
/// message. Pure logic — no locking — so callers must hold their own lock if
/// they need atomicity with a subsequent operation.
fn ensure_clean_clone_target(skills_dir: &Path) -> Result<()> {
    if !skills_dir.exists() {
        return Ok(());
    }
    if skills_dir.join(".git").exists() {
        return Ok(());
    }
    if skills_dir.is_file() {
        anyhow::bail!(
            "refusing to clone into {}: path exists and is a file, not a directory",
            skills_dir.display()
        );
    }
    let mut entries = std::fs::read_dir(skills_dir)
        .with_context(|| format!("Failed to read clone target {}", skills_dir.display()))?;
    if entries.next().is_some() {
        anyhow::bail!(
            "refusing to clone into {}: directory is non-empty and not a git repo. \
             Files in the target would be silently merged into the cloned repo. \
             Point the target at an empty or non-existent directory.",
            skills_dir.display()
        );
    }
    Ok(())
}

/// Size thresholds from the backup redesign (§3.6): warn on any single skill
/// directory above 100 MB and on a repository above 1 GB.
pub const SKILL_SIZE_LIMIT_BYTES: u64 = 100 * 1024 * 1024;
pub const REPO_SIZE_WARN_BYTES: u64 = 1024 * 1024 * 1024;

#[derive(Debug, Clone, serde::Serialize)]
pub struct OversizedSkill {
    pub name: String,
    pub bytes: u64,
    /// True when the skill is excluded from backup (§3.6: oversized and not
    /// yet tracked by git). False = already backed up, warning only.
    pub excluded: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct BackupSizeReport {
    /// Total size of backed-up content (working tree, `.git` excluded).
    pub total_bytes: u64,
    /// Skill directories above `skill_limit_bytes`.
    pub oversized: Vec<OversizedSkill>,
    pub skill_limit_bytes: u64,
    pub repo_warn_bytes: u64,
}

/// Skill directories (valid, depth ≤ 6) whose content exceeds `limit`,
/// as repo-relative slash paths with their sizes. Also returns the total
/// working-tree size.
fn oversized_skill_dirs(skills_dir: &Path, limit: u64) -> (Vec<(String, u64)>, u64) {
    let mut total_bytes: u64 = 0;
    let mut oversized = Vec::new();
    if skills_dir.exists() {
        let mut it = walkdir::WalkDir::new(skills_dir)
            .min_depth(1)
            .max_depth(
                if skills_dir.join(".agent-hub/backup-layout.json").exists() {
                    7
                } else {
                    6
                },
            )
            .into_iter()
            .filter_entry(|e| e.file_name().to_string_lossy() != ".git");
        while let Some(entry) = it.next() {
            let Ok(entry) = entry else { continue };
            let path = entry.path();
            if entry.file_type().is_file() {
                total_bytes += entry.metadata().map(|m| m.len()).unwrap_or(0);
                continue;
            }
            if entry.file_type().is_dir() && super::skill_metadata::is_valid_skill_dir(path) {
                let bytes = dir_size(path);
                total_bytes += bytes;
                if bytes > limit {
                    let rel = path
                        .strip_prefix(skills_dir)
                        .map(|p| {
                            p.components()
                                .map(|c| c.as_os_str().to_string_lossy().to_string())
                                .collect::<Vec<_>>()
                                .join("/")
                        })
                        .unwrap_or_default();
                    if !rel.is_empty() {
                        oversized.push((rel, bytes));
                    }
                }
                // The whole subtree is accounted for; don't double-count files
                // or nested dirs inside this skill.
                it.skip_current_dir();
            }
        }
    }
    (oversized, total_bytes)
}

/// Whether any file under `rel_path` is tracked by git.
fn is_tracked(skills_dir: &Path, rel_path: &str) -> bool {
    run_git(
        skills_dir,
        &["ls-files", "--", &format!(":(literal){rel_path}")],
    )
    .map(|out| !out.trim().is_empty())
    .unwrap_or(false)
}

/// Scan the skills directory for backup-size problems (§3.6). Read-only.
pub fn size_report(skills_dir: &Path) -> Result<BackupSizeReport> {
    let (dirs, total_bytes) = oversized_skill_dirs(skills_dir, SKILL_SIZE_LIMIT_BYTES);
    let is_repo = skills_dir.join(".git").exists();
    let mut oversized: Vec<OversizedSkill> = dirs
        .into_iter()
        .map(|(rel, bytes)| OversizedSkill {
            name: rel.rsplit('/').next().unwrap_or(&rel).to_string(),
            bytes,
            excluded: is_repo && !is_tracked(skills_dir, &rel),
        })
        .collect();

    oversized.sort_by_key(|a| std::cmp::Reverse(a.bytes));
    Ok(BackupSizeReport {
        total_bytes,
        oversized,
        skill_limit_bytes: SKILL_SIZE_LIMIT_BYTES,
        repo_warn_bytes: REPO_SIZE_WARN_BYTES,
    })
}

const OVERSIZED_SECTION_BEGIN: &str =
    "# agent-hub: oversized skills excluded from backup (auto-managed)";
const OVERSIZED_SECTION_END: &str = "# agent-hub: end oversized skills";

/// Escape a repo-relative path for use as a literal gitignore pattern.
fn gitignore_escape(path: &str) -> String {
    let mut out = String::with_capacity(path.len());
    for c in path.chars() {
        if matches!(c, '\\' | '*' | '?' | '[' | ']' | '!' | '#') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// §3.6 后半: keep oversized skills out of the backup by default. A skill
/// directory above `limit` that is NOT yet tracked by git gets its content
/// dir and its metadata file added to a managed `.gitignore` section (the
/// skill stays on disk and in the local DB). Already-tracked skills are
/// never untracked — removing them from the tree would propagate to other
/// devices as a deletion — they only warn (`size_report`). The section is
/// rebuilt from scratch on every commit, so a skill that shrinks below the
/// limit re-enters the backup automatically.
pub(crate) fn apply_oversized_exclusions(skills_dir: &Path, limit: u64) -> Result<Vec<String>> {
    let (dirs, _total) = oversized_skill_dirs(skills_dir, limit);
    let mut excluded: Vec<String> = Vec::new();
    let mut lines: Vec<String> = Vec::new();

    if !dirs.is_empty() {
        // Map content path → skill_id so the paired metadata file is
        // excluded too (a tracked metadata file pointing at an ignored dir
        // would fail §7 validation on every other device).
        let mut id_by_path = std::collections::HashMap::new();
        let meta_dir = skills_dir.join(".agent-hub/skills");
        if meta_dir.is_dir() {
            for entry in std::fs::read_dir(&meta_dir)?.flatten() {
                if let Ok(raw) = std::fs::read_to_string(entry.path()) {
                    if let Ok(meta) =
                        serde_json::from_str::<crate::core::sync_metadata::SkillMetaFile>(&raw)
                    {
                        id_by_path.insert(meta.path, meta.skill_id);
                    }
                }
            }
        }
        for (rel, bytes) in dirs {
            if is_tracked(skills_dir, &rel) {
                continue; // already backed up: warn only, never untrack
            }
            lines.push(format!("/{}/", gitignore_escape(&rel)));
            if let Some(id) = id_by_path.get(&rel) {
                lines.push(format!("/.agent-hub/skills/{}.json", gitignore_escape(id)));
            }
            log::info!(
                "backup size: excluding oversized skill '{rel}' ({} MB) from backup",
                bytes / (1024 * 1024)
            );
            excluded.push(rel);
        }
    }

    rewrite_gitignore_section(skills_dir, &lines)?;
    Ok(excluded)
}

/// Idempotently rewrite the managed oversized section of `.gitignore`
/// (created, replaced, or removed when empty), leaving user lines intact.
fn rewrite_gitignore_section(skills_dir: &Path, section_lines: &[String]) -> Result<()> {
    let gitignore = skills_dir.join(".gitignore");
    let existing = if gitignore.exists() {
        std::fs::read_to_string(&gitignore)?
    } else {
        String::new()
    };
    let mut kept: Vec<String> = Vec::new();
    let mut in_section = false;
    let mut had_section = false;
    for line in existing.lines() {
        if line.trim() == OVERSIZED_SECTION_BEGIN {
            in_section = true;
            had_section = true;
            continue;
        }
        if line.trim() == OVERSIZED_SECTION_END {
            in_section = false;
            continue;
        }
        if !in_section {
            kept.push(line.to_string());
        }
    }
    if section_lines.is_empty() {
        if !had_section {
            return Ok(()); // nothing to add, nothing to remove
        }
    } else {
        while kept.last().map(|l| l.trim().is_empty()).unwrap_or(false) {
            kept.pop();
        }
        kept.push(String::new());
        kept.push(OVERSIZED_SECTION_BEGIN.to_string());
        kept.extend(section_lines.iter().cloned());
        kept.push(OVERSIZED_SECTION_END.to_string());
    }
    std::fs::write(
        &gitignore,
        format!("{}\n", kept.join("\n").trim_end_matches('\n')),
    )?;
    Ok(())
}

fn dir_size(dir: &Path) -> u64 {
    walkdir::WalkDir::new(dir)
        .into_iter()
        .flatten()
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum()
}

// ── Helpers ──

fn ensure_repo(skills_dir: &Path) -> Result<()> {
    if !skills_dir.join(".git").exists() {
        anyhow::bail!("Skills directory is not a git repository. Initialize it first.");
    }
    ensure_files_ref_format(skills_dir)
}

/// libgit2 (merge, git2 engine) cannot open a reftable repository; it would
/// fail later with an opaque "invalid ref" error. Created when the user's git
/// defaults to reftable. Migrating rewrites the user's refs, so we only explain.
pub(crate) fn ensure_files_ref_format(skills_dir: &Path) -> Result<()> {
    if skills_dir.join(".git").join("reftable").is_dir() {
        anyhow::bail!(
            "The skills library's git repository uses the reftable format, which agent-hub cannot read. \
             Close other git tools, run `git -C \"{}\" refs migrate --ref-format=files` (Git 2.48+), then try again.",
            skills_dir.display()
        );
    }
    Ok(())
}

/// Delete atomic-write temp leftovers (`*.tmp.<uuid>`) under the metadata
/// namespace of THIS repo's working tree. Best-effort; a leftover appears
/// only when a writer crashed mid-write.
fn remove_tmp_metadata_files(skills_dir: &Path) {
    let meta_root = skills_dir.join(".agent-hub");
    if !meta_root.exists() {
        return;
    }
    for entry in walkdir::WalkDir::new(&meta_root).into_iter().flatten() {
        if entry.file_type().is_file() && entry.file_name().to_string_lossy().contains(".tmp.") {
            if let Err(e) = std::fs::remove_file(entry.path()) {
                log::warn!(
                    "git commit: failed to remove temp metadata file {}: {e}",
                    entry.path().display()
                );
            } else {
                log::info!(
                    "git commit: removed stale temp metadata file {}",
                    entry.path().display()
                );
            }
        }
    }
}

pub(crate) fn ensure_no_interrupted_git_operation(skills_dir: &Path) -> Result<()> {
    ensure_files_ref_format(skills_dir)?;
    let git_dir = skills_dir.join(".git");
    for marker in ["MERGE_HEAD", "index.lock", "rebase-merge", "rebase-apply"] {
        if git_dir.join(marker).exists() {
            anyhow::bail!(
                "Git operation is already in progress ({marker}); resolve it before syncing"
            );
        }
    }
    Ok(())
}

/// Patterns for compiled-Python artifacts, kept in exact parity with
/// `content_hash::is_ignored` — `__pycache__` and `*.pyc`, nothing wider.
///
/// A skill's scripts run straight out of the library (agents reach it through a
/// symlink), so Python writes `__pycache__/` into the library itself; filtering
/// on import cannot help with something generated afterwards. The content hash
/// already declares these outside a skill's content, so backing them up put the
/// two layers at odds.
///
/// Deliberately not `*.py[cod]`: `is_ignored` counts `.pyd` (a real Windows
/// extension module some skills ship) as content, so ignoring it here would
/// recreate the same inconsistency in the other direction — the file would be
/// missing after a restore and every device would report the skill as modified.
const PYTHON_ARTIFACT_IGNORES: [&str; 2] = ["__pycache__/", "*.pyc"];

fn ensure_gitignore(skills_dir: &Path) -> Result<()> {
    let gitignore = skills_dir.join(".gitignore");
    let required = [
        ".DS_Store",
        "Thumbs.db",
        "*.tmp",
        ".agent-hub.lock",
        PYTHON_ARTIFACT_IGNORES[0],
        PYTHON_ARTIFACT_IGNORES[1],
    ];
    let mut lines: Vec<String> = if gitignore.exists() {
        std::fs::read_to_string(&gitignore)?
            .lines()
            .map(ToOwned::to_owned)
            .collect()
    } else {
        Vec::new()
    };
    let existing: std::collections::HashSet<String> =
        lines.iter().map(|line| line.trim().to_string()).collect();
    for line in required
        .into_iter()
        .chain(local_state::PATTERNS.iter().copied())
    {
        if !existing.contains(line) {
            lines.push(line.to_string());
        }
    }
    std::fs::write(&gitignore, format!("{}\n", lines.join("\n")))?;
    if skills_dir.join(".git").exists() {
        local_state::untrack(skills_dir)?;
    }
    Ok(())
}

/// Drop compiled-Python artifacts that were committed before they were ignored.
///
/// `.gitignore` only governs *untracked* paths — `git add -A` keeps re-staging
/// anything already in the index, so adding the patterns above fixes nothing for
/// a library that has been backing up `__pycache__` all along. This is the
/// one-time catch-up; once the index is clean the `ls-files` below matches
/// nothing and the whole thing is a no-op.
///
/// This deliberately untracks, where [`apply_oversized_exclusions`] deliberately
/// does not (see its `never untrack` guard). The difference is what is at stake:
/// an oversized skill is the user's own content and dropping it from the backup
/// could destroy the only copy, whereas these are regenerated the next time the
/// skill's scripts run and the content hash already treats them as absent.
/// `--cached` keeps every byte on disk; other devices merely stop carrying them.
fn untrack_python_artifacts(skills_dir: &Path) -> Result<()> {
    let tracked = run_git(
        skills_dir,
        &["ls-files", "--", "*.pyc", "**/__pycache__/**"],
    )?;
    if tracked.trim().is_empty() {
        return Ok(());
    }

    let count = tracked.lines().filter(|l| !l.trim().is_empty()).count();
    run_git_checked(
        skills_dir,
        &[
            "rm",
            "-r",
            "--cached",
            "--quiet",
            "--ignore-unmatch",
            "--",
            "*.pyc",
            "**/__pycache__/**",
        ],
    )?;
    log::info!(
        "backup: stopped tracking {count} compiled-Python artifact(s); \
         they stay on disk and are regenerated as needed"
    );
    Ok(())
}

/// Runs `f` while holding the central-repo lock. Used by the user-initiated
/// backup commands (init/commit/pull/clone/reclone/restore), so we wait out
/// transient contention with background work instead of failing fast.
pub(crate) fn with_repo_lock<T, F>(operation: &str, f: F) -> Result<T>
where
    F: FnOnce() -> Result<T>,
{
    let _lock = RepoLock::acquire_foreground(operation)?;
    f()
}

fn run_git(dir: &Path, args: &[&str]) -> Result<String> {
    run_git_env(dir, args, &[])
}

fn run_git_env(dir: &Path, args: &[&str], envs: &[(String, String)]) -> Result<String> {
    let output = git_command()
        .arg("-C")
        .arg(dir)
        .args(args)
        .envs(envs.iter().map(|(k, v)| (k.as_str(), v.as_str())))
        .output()
        .context("Failed to run git command")?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let filtered = stderr
            .lines()
            .filter(|line| {
                let trimmed = line.trim().trim_start_matches("** ");
                !trimmed.starts_with("WARNING:")
                    && !trimmed.starts_with("This session may")
                    && !trimmed.starts_with("The server may")
                    && !trimmed.starts_with("See https://openssh.com")
            })
            .collect::<Vec<_>>()
            .join("\n");
        let msg = if filtered.trim().is_empty() {
            stderr.trim()
        } else {
            filtered.trim()
        };
        anyhow::bail!("git command failed: {}", redact_urls_in_text(msg))
    }
}

fn run_git_checked(dir: &Path, args: &[&str]) -> Result<()> {
    run_git_env_checked(dir, args, &[])
}

fn run_git_env_checked(dir: &Path, args: &[&str], envs: &[(String, String)]) -> Result<()> {
    if let Err(e) = run_git_env(dir, args, envs) {
        // Single chokepoint for genuine git failures: every aborting step
        // (commit, push -u, fetch+merge, tag, read-tree, …) goes through here,
        // so this is where "sync silently failed" becomes visible in the log.
        // Redact the args because some carry the remote URL (which may embed a token).
        log::warn!(
            "git failed [{}]: {}",
            redact_urls_in_text(&args.join(" ")),
            e
        );
        return Err(e);
    }
    Ok(())
}

fn get_ahead_behind(dir: &Path) -> Result<(u32, u32)> {
    let output = run_git(
        dir,
        &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    )?;
    let parts: Vec<&str> = output.split_whitespace().collect();
    if parts.len() == 2 {
        let ahead = parts[0].parse().unwrap_or(0);
        let behind = parts[1].parse().unwrap_or(0);
        Ok((ahead, behind))
    } else {
        Ok((0, 0))
    }
}

fn redact_urls_in_text(text: &str) -> String {
    text.split_whitespace()
        .map(redact_url)
        .collect::<Vec<_>>()
        .join(" ")
}

/// Mask credentials embedded in a URL's userinfo (the `user:token@` before the
/// host). Note: this only covers the userinfo form, not credentials passed as
/// query parameters (e.g. `?token=…`); our remote URLs never use that form.
fn redact_url(url: &str) -> String {
    let Some(scheme_pos) = url.find("://") else {
        return url.to_string();
    };
    let auth_start = scheme_pos + 3;
    let rest = &url[auth_start..];

    let end_auth = rest
        .find(['/', '?', '#'])
        .map(|idx| auth_start + idx)
        .unwrap_or(url.len());
    let auth_part = &url[auth_start..end_auth];

    if let Some(at_rel) = auth_part.find('@') {
        let at_pos = auth_start + at_rel;
        let mut masked = String::with_capacity(url.len());
        masked.push_str(&url[..auth_start]);
        masked.push_str("***@");
        masked.push_str(&url[at_pos + 1..]);
        masked
    } else {
        url.to_string()
    }
}

fn parse_restored_from_tag_message(message: &str) -> Option<String> {
    let prefix = "restore: switch skills library to ";
    let tag = message.strip_prefix(prefix)?.trim();
    if tag.starts_with("sm-v-") || history::is_commit_reference(tag) {
        Some(tag.to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests;
