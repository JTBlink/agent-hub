//! Check the application's own public stable release feed.

use crate::core::{error::AppError, skillssh_api::build_http_client};

const LATEST_RELEASE_API: &str = "https://api.github.com/repos/JTBlink/agent-hub/releases/latest";
const RELEASES_URL: &str = "https://github.com/JTBlink/agent-hub/releases";

pub use super::super::contracts::AppUpdateInfo;

#[derive(serde::Deserialize)]
struct Release {
    tag_name: String,
    draft: bool,
    prerelease: bool,
}

fn release_info(current: &str, release: Release) -> Result<AppUpdateInfo, AppError> {
    let tag = release.tag_name.trim();
    let latest = semver::Version::parse(tag.strip_prefix('v').unwrap_or(tag))
        .map_err(|_| AppError::network("APP_UPDATE_INVALID_RELEASE"))?;
    if release.draft || release.prerelease || !latest.pre.is_empty() {
        return Err(AppError::network("APP_UPDATE_INVALID_RELEASE"));
    }
    let current_version = semver::Version::parse(current)
        .map_err(|_| AppError::invalid_input("APP_UPDATE_INVALID_VERSION"))?;
    Ok(AppUpdateInfo {
        has_update: latest.cmp_precedence(&current_version).is_gt(),
        current_version: current.to_owned(),
        latest_version: latest.to_string(),
        // Construct from this repository and a parsed SemVer tag, never a remote URL.
        release_url: format!("{RELEASES_URL}/tag/{tag}"),
    })
}

fn fetch_release(client: &reqwest::blocking::Client, url: &str) -> Result<Release, AppError> {
    let response = client
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .map_err(|_| AppError::network("APP_UPDATE_CHECK_FAILED"))?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(AppError::not_found("APP_UPDATE_NO_RELEASE"));
    }
    response
        .error_for_status()
        .map_err(|_| AppError::network("APP_UPDATE_CHECK_FAILED"))?
        .json()
        .map_err(|_| AppError::network("APP_UPDATE_INVALID_RELEASE"))
}

/// Query the public release feed using the user's configured proxy, without credentials.
pub fn check_update(current: &str, proxy: Option<&str>) -> Result<AppUpdateInfo, AppError> {
    // Independent products must never offer the standard product's installer.
    // Until a separate channel is configured, use the existing no-release state.
    if crate::product::current().product_id != "standard" {
        return Err(AppError::not_found("APP_UPDATE_NO_RELEASE"));
    }
    let client = build_http_client(proxy, 15);
    release_info(current, fetch_release(&client, LATEST_RELEASE_API)?)
}

#[cfg(test)]
mod tests;
