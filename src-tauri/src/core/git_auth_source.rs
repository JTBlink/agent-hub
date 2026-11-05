//! Credential source selection for both system Git and libgit2.
use super::git_credentials::{self, RemoteCredential};
use anyhow::Result;
use std::sync::atomic::{AtomicBool, Ordering};

pub(crate) const SETTING_USE_GH: &str = "backup_use_gh";
static USE_GH: AtomicBool = AtomicBool::new(true);

/// Loaded for both desktop and CLI startup, updated after a settings write.
pub(crate) fn set_preference(value: Option<&str>) {
    USE_GH.store(preference_enabled(value), Ordering::Relaxed);
}

fn preference_enabled(value: Option<&str>) -> bool {
    !matches!(
        value.map(|v| v.trim().to_ascii_lowercase()).as_deref(),
        Some("off" | "false" | "0" | "no")
    )
}

pub(crate) fn resolve(host: &str) -> Result<Option<RemoteCredential>> {
    select(
        host,
        cfg!(feature = "github") && USE_GH.load(Ordering::Relaxed),
        github_credential,
        || git_credentials::load_credential(host),
    )
}

fn github_credential() -> Option<RemoteCredential> {
    #[cfg(feature = "github")]
    return super::gh_credentials::load();
    #[cfg(not(feature = "github"))]
    None
}

fn select(
    host: &str,
    use_gh: bool,
    gh: impl FnOnce() -> Option<RemoteCredential>,
    app: impl FnOnce() -> Result<Option<RemoteCredential>>,
) -> Result<Option<RemoteCredential>> {
    if use_gh && host.eq_ignore_ascii_case("github.com") {
        if let Some(credential) = gh() {
            log::info!("git credentials: source=gh");
            return Ok(Some(credential));
        }
    }
    let credential = app()?;
    log::info!(
        "git credentials: source={}, prefer_gh={use_gh}",
        if credential.is_some() {
            "app"
        } else {
            "git-config"
        }
    );
    Ok(credential)
}

#[cfg(test)]
mod tests;
