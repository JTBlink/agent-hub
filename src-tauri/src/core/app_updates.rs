//! Check the application's own public stable release feed.

use super::{error::AppError, skillssh_api::build_http_client};

const LATEST_RELEASE_API: &str = "https://api.github.com/repos/JTBlink/agent-hub/releases/latest";
const RELEASES_URL: &str = "https://github.com/JTBlink/agent-hub/releases";

/// Existing desktop update notification contract, also used by manual checks.
#[derive(Debug, serde::Serialize)]
pub struct AppUpdateInfo {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_url: String,
}

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
    let client = build_http_client(proxy, 15);
    release_info(current, fetch_release(&client, LATEST_RELEASE_API)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stable(tag: &str) -> Release {
        Release {
            tag_name: tag.into(),
            draft: false,
            prerelease: false,
        }
    }
    #[test]
    fn compares_release_versions_numerically_and_ignores_build_metadata() {
        let release = super::Release {
            tag_name: "v0.1.10".into(),
            draft: false,
            prerelease: false,
        };
        let info = super::release_info("0.1.9+local", release).unwrap();
        assert!(info.has_update);
        assert_eq!(info.latest_version, "0.1.10");
        assert_eq!(
            info.release_url,
            "https://github.com/JTBlink/agent-hub/releases/tag/v0.1.10"
        );
    }

    #[test]
    fn does_not_offer_equal_or_older_stable_releases() {
        assert!(!release_info("0.1.10", stable("v0.1.9")).unwrap().has_update);
        assert!(
            !release_info("0.1.10+local", stable("0.1.10+release"))
                .unwrap()
                .has_update
        );
        assert!(
            release_info("0.1.10-beta.1", stable("v0.1.10"))
                .unwrap()
                .has_update
        );
    }

    #[test]
    fn rejects_invalid_versions_and_nonstable_release_metadata() {
        for release in [
            stable("latest"),
            stable("v0.1.10-beta.1"),
            Release {
                draft: true,
                ..stable("v0.1.10")
            },
            Release {
                prerelease: true,
                ..stable("v0.1.10")
            },
        ] {
            assert!(release_info("0.1.9", release).is_err());
        }
        assert!(release_info("unknown", stable("v0.1.10")).is_err());
    }

    #[test]
    fn http_errors_and_missing_releases_never_report_up_to_date() {
        use std::{
            io::{Read, Write},
            net::TcpListener,
        };
        for (status, expected) in [
            ("404 Not Found", "APP_UPDATE_NO_RELEASE"),
            ("403 Forbidden", "APP_UPDATE_CHECK_FAILED"),
            ("500 Internal Server Error", "APP_UPDATE_CHECK_FAILED"),
            ("200 OK", "APP_UPDATE_INVALID_RELEASE"),
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let url = format!("http://{}/release", listener.local_addr().unwrap());
            let server = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                    .unwrap();
                let mut bytes = [0; 4096];
                let mut request = Vec::new();
                while !request.windows(4).any(|part| part == b"\r\n\r\n") {
                    let count = stream.read(&mut bytes).unwrap();
                    if count == 0 {
                        break;
                    }
                    request.extend_from_slice(&bytes[..count]);
                }
                write!(
                    stream,
                    "HTTP/1.1 {status}\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}"
                )
                .unwrap();
            });
            let client = reqwest::blocking::Client::builder()
                .no_proxy()
                .timeout(std::time::Duration::from_secs(5))
                .build()
                .unwrap();
            let error = fetch_release(&client, &url)
                .err()
                .expect("release request must fail");
            assert_eq!(error.message, expected);
            server.join().unwrap();
        }
    }
}
