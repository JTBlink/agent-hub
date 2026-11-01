//! git2-based network engine for the backup remote (backup redesign §3.3,
//! Phase 2 pilot).
//!
//! Scope is deliberately narrow: only the four network operations (fetch,
//! push, ls-remote, clone) against http(s) remotes go through libgit2, with
//! credentials injected in-memory from the OS keychain. All local operations
//! (commit, tag, status, merge, read-tree) stay on system git, and SSH /
//! custom remotes always use system git. Opt-in via the `git_backup_engine`
//! setting ("git2"); default is the system git engine.
//!
//! Error normalization matters here: the frontend maps error text produced
//! by system git ("Authentication failed", "Could not resolve host",
//! "non-fast-forward", …) to plain-language copy. libgit2 phrases the same
//! failures differently, so every error leaving this module is prefixed with
//! the equivalent system-git marker.

use anyhow::{Context, Result};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

use super::git_credentials;

static PILOT_ENABLED: AtomicBool = AtomicBool::new(false);
static PROXY_URL: OnceLock<Mutex<Option<String>>> = OnceLock::new();

/// Sync the engine preference from settings. Called at the entry of backup
/// commands (core code has no store access).
pub fn set_preference(git2_enabled: bool, proxy_url: Option<String>) {
    PILOT_ENABLED.store(git2_enabled, Ordering::Relaxed);
    *PROXY_URL
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = proxy_url.filter(|s| !s.is_empty());
}

fn proxy_url() -> Option<String> {
    PROXY_URL
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

/// Whether the git2 engine should handle operations against `url`.
pub fn applies_to(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    PILOT_ENABLED.load(Ordering::Relaxed)
        && (lower.starts_with("https://") || lower.starts_with("http://"))
}

fn callbacks_for(url: &str) -> git2::RemoteCallbacks<'static> {
    let cred = git_credentials::https_host(url)
        .and_then(|host| super::git_auth_source::resolve(&host).ok().flatten());
    let mut callbacks = git2::RemoteCallbacks::new();
    // libgit2 re-invokes the credentials callback after a rejection; without
    // a cap that loops forever on a bad token.
    let mut attempts = 0;
    callbacks.credentials(move |_url, username_from_url, _allowed| {
        attempts += 1;
        if attempts > 2 {
            return Err(git2::Error::from_str("authentication attempts exhausted"));
        }
        match &cred {
            Some(c) => git2::Cred::userpass_plaintext(&c.username, &c.password),
            // No stored credential: try the URL's own username (if any) with
            // an empty password rather than hanging on a prompt.
            None => git2::Cred::userpass_plaintext(username_from_url.unwrap_or_default(), ""),
        }
    });
    callbacks
}

fn proxy_options() -> git2::ProxyOptions<'static> {
    let mut opts = git2::ProxyOptions::new();
    match proxy_url() {
        Some(url) => {
            opts.url(&url);
        }
        None => {
            opts.auto();
        }
    }
    opts
}

fn fetch_options(url: &str) -> git2::FetchOptions<'static> {
    let mut opts = git2::FetchOptions::new();
    opts.remote_callbacks(callbacks_for(url));
    opts.proxy_options(proxy_options());
    opts
}

/// Translate a libgit2 error into the marker vocabulary the frontend's git
/// error mapping already understands.
fn normalize_err(e: git2::Error, operation: &str) -> anyhow::Error {
    let msg = e.message().to_string();
    let lower = msg.to_ascii_lowercase();
    let marker = if e.code() == git2::ErrorCode::Auth
        || lower.contains("authentication")
        || lower.contains("401")
        || lower.contains("403")
    {
        "Authentication failed"
    } else if e.code() == git2::ErrorCode::NotFastForward {
        "non-fast-forward"
    } else if e.class() == git2::ErrorClass::Net
        || lower.contains("resolve")
        || lower.contains("connect")
        || lower.contains("timed out")
    {
        "Failed to connect"
    } else if e.class() == git2::ErrorClass::Ssl {
        "TLS/SSL error"
    } else {
        ""
    };
    if marker.is_empty() {
        anyhow::anyhow!("git2 {operation} failed: {msg}")
    } else {
        anyhow::anyhow!("git2 {operation} failed: {marker}: {msg}")
    }
}

/// Fetch `branch` (or the remote's configured refspecs when `None`) from
/// origin, updating the usual remote-tracking refs.
pub fn fetch(repo_dir: &Path, branch: Option<&str>, url: &str) -> Result<()> {
    let repo = git2::Repository::open(repo_dir).context("Failed to open repository")?;
    let mut remote = repo.find_remote("origin").context("No origin remote")?;
    let refspecs: Vec<String> = match branch {
        Some(b) => vec![format!("+refs/heads/{b}:refs/remotes/origin/{b}")],
        None => Vec::new(),
    };
    let refs: Vec<&str> = refspecs.iter().map(String::as_str).collect();
    remote
        .fetch(&refs, Some(&mut fetch_options(url)), None)
        .map_err(|e| normalize_err(e, "fetch"))?;
    log::info!(
        "git2 fetch: done ({})",
        branch.unwrap_or("configured refspecs")
    );
    Ok(())
}

/// Push the given refspecs to origin. Per-reference rejections (the
/// non-fast-forward case) are surfaced as errors even though the transport
/// call itself succeeds.
pub fn push_refs(repo_dir: &Path, refspecs: &[String], url: &str) -> Result<()> {
    let repo = git2::Repository::open(repo_dir).context("Failed to open repository")?;
    let mut remote = repo.find_remote("origin").context("No origin remote")?;

    let rejected: std::sync::Arc<Mutex<Vec<String>>> = Default::default();
    let rejected_in_cb = rejected.clone();
    let mut callbacks = callbacks_for(url);
    callbacks.push_update_reference(move |refname, status| {
        if let Some(reason) = status {
            rejected_in_cb
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .push(format!("{refname}: {reason}"));
        }
        Ok(())
    });

    let mut opts = git2::PushOptions::new();
    opts.remote_callbacks(callbacks);
    opts.proxy_options(proxy_options());

    remote
        .push(refspecs, Some(&mut opts))
        .map_err(|e| normalize_err(e, "push"))?;

    let rejected = rejected.lock().unwrap_or_else(|e| e.into_inner());
    if !rejected.is_empty() {
        // Same vocabulary as system git so the UI routes to recovery.
        anyhow::bail!(
            "git2 push failed: non-fast-forward, failed to push some refs ({})",
            rejected.join("; ")
        );
    }
    log::info!("git2 push: pushed {} refspec(s)", refspecs.len());
    Ok(())
}

/// List remote ref names (heads and tags) for `url` without a local repo.
pub fn ls_remote_refs(url: &str) -> Result<Vec<String>> {
    let mut remote =
        git2::Remote::create_detached(url).context("Failed to create detached remote")?;
    let connection = remote
        .connect_auth(
            git2::Direction::Fetch,
            Some(callbacks_for(url)),
            Some(proxy_options()),
        )
        .map_err(|e| normalize_err(e, "ls-remote"))?;
    let names = connection
        .list()
        .map_err(|e| normalize_err(e, "ls-remote"))?
        .iter()
        .map(|head| head.name().to_string())
        .collect();
    Ok(names)
}

/// Full clone (backup needs complete history — no shallow).
pub fn clone(url: &str, dest: &Path) -> Result<()> {
    let mut builder = git2::build::RepoBuilder::new();
    builder.fetch_options(fetch_options(url));
    builder
        .clone(url, dest)
        .map_err(|e| normalize_err(e, "clone"))?;
    log::info!("git2 clone: done");
    Ok(())
}

#[cfg(test)]
mod tests;
