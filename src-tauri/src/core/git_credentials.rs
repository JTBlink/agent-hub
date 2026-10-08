//! Credential handling for the git backup remote.
//!
//! Policy (backup redesign §3.7): tokens must never live in URLs on disk
//! (`.git/config`, SQLite settings). Credentials embedded in a remote URL are
//! saved in owner-only local credential files and injected into git through
//! a noninteractive helper that reads credentials from environment variables.

use anyhow::{Context, Result};
use std::sync::OnceLock;

use super::central_repo;

fn credential_cache() -> &'static super::credential_cache::CredentialCache {
    static CACHE: OnceLock<super::credential_cache::CredentialCache> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

const KEYRING_SERVICE: &str = "agent-hub-git-backup";

/// Debug binaries are ad-hoc signed on macOS. Their code signature changes on
/// every rebuild, so background reads can repeatedly trigger a Keychain ACL
/// prompt. Keep background access off in development unless explicitly opted in.
pub fn background_access_enabled() -> bool {
    #[cfg(debug_assertions)]
    {
        std::env::var("AGENT_HUB_DEV_KEYCHAIN")
            .map(|value| {
                matches!(
                    value.trim().to_ascii_lowercase().as_str(),
                    "1" | "true" | "on"
                )
            })
            .unwrap_or(false)
    }
    #[cfg(not(debug_assertions))]
    {
        true
    }
}

/// Environment variable names consumed by the askpass script. The script
/// itself contains no secrets — it just echoes these back to git.
const ENV_USERNAME: &str = "AGENT_HUB_ASKPASS_USERNAME";
const ENV_PASSWORD: &str = "AGENT_HUB_ASKPASS_PASSWORD";

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct RemoteCredential {
    pub username: String,
    pub password: String,
}

/// Split userinfo credentials out of an http(s) URL.
///
/// Returns the extracted credential plus the sanitized URL (no userinfo).
/// `None` when the URL is not http(s) or carries no userinfo. A token-only
/// form (`https://TOKEN@host/...`) is kept faithful: username = token,
/// password = empty — exactly what git derived from the embedded URL.
pub fn split_credentials_from_url(url: &str) -> Option<(RemoteCredential, String)> {
    let trimmed = url.trim();
    let lower = trimmed.to_lowercase();
    if !lower.starts_with("https://") && !lower.starts_with("http://") {
        return None;
    }
    let scheme_end = trimmed.find("://")? + 3;
    let rest = &trimmed[scheme_end..];
    let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = &rest[..authority_end];

    let at_pos = authority.rfind('@')?;
    let userinfo = &authority[..at_pos];
    let host_part = &authority[at_pos + 1..];

    let (raw_user, raw_pass) = match userinfo.split_once(':') {
        Some((u, p)) => (u, p),
        None => (userinfo, ""),
    };
    let decode = |s: &str| {
        urlencoding::decode(s)
            .map(|c| c.into_owned())
            .unwrap_or_else(|_| s.to_string())
    };

    let sanitized = format!(
        "{}{}{}",
        &trimmed[..scheme_end],
        host_part,
        &rest[authority_end..]
    );
    Some((
        RemoteCredential {
            username: decode(raw_user),
            password: decode(raw_pass),
        },
        sanitized,
    ))
}

/// Host (including port, if any) of an http(s) URL with userinfo stripped.
/// Used as the keychain account key.
pub fn https_host(url: &str) -> Option<String> {
    let trimmed = url.trim();
    let lower = trimmed.to_lowercase();
    if !lower.starts_with("https://") && !lower.starts_with("http://") {
        return None;
    }
    let scheme_end = trimmed.find("://")? + 3;
    let rest = &trimmed[scheme_end..];
    let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = &rest[..authority_end];
    let host = match authority.rfind('@') {
        Some(at) => &authority[at + 1..],
        None => authority,
    };
    if host.is_empty() {
        return None;
    }
    Some(host.to_ascii_lowercase())
}

fn keyring_entry(host: &str) -> Result<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, host).context("Failed to open keychain entry")
}

fn cache_key(host: &str) -> String {
    format!(
        "{}|{}",
        central_repo::base_dir().display(),
        host.to_ascii_lowercase()
    )
}

pub fn store_credential(host: &str, cred: &RemoteCredential) -> Result<()> {
    credential_cache().write(&cache_key(host), Some(cred.clone()), || {
        super::credential_file::write(host, Some(cred))
    })
}

pub fn load_credential(host: &str) -> Result<Option<RemoteCredential>> {
    credential_cache().read(&cache_key(host), || {
        load_persistent(host, || {
            // One-time migration only. Subsequent processes read the local file;
            // repeated syncs in this process use the memory cache.
            let value = match keyring_entry(host)?.get_password() {
            Ok(payload) => {
                Some(serde_json::from_str(&payload).context("Corrupted legacy Git credential")?)
            }
            Err(keyring::Error::NoEntry) => None,
            Err(error) => return Err(error).context(
                "Cannot migrate legacy Git credential; sign in again to save a local credential",
            ),
        };
            Ok(value)
        })
    })
}

fn load_persistent(
    host: &str,
    legacy: impl FnOnce() -> Result<Option<RemoteCredential>>,
) -> Result<Option<RemoteCredential>> {
    if let Some(value) = super::credential_file::read(host)? {
        return Ok(value);
    }
    let value = legacy()?;
    super::credential_file::write(host, value.as_ref())?;
    Ok(value)
}

pub fn delete_credential(host: &str) -> Result<()> {
    credential_cache().write(&cache_key(host), None, || {
        super::credential_file::write(host, None)
    })
}

/// Attach a credentials callback to libgit2 network operations against `url`.
///
/// Sources, in order: the credential this app cached locally for the
/// host, then the user's git credential helper (osxkeychain, Git Credential
/// Manager, libsecret) — the same place system git would have looked — then an
/// ssh-agent key for ssh remotes.
///
/// The helper fallback is the one that matters for skill sources. The keychain
/// only holds hosts this app connected itself, which in practice means the
/// backup remote; a skill living on a private GitLab or Gitea has no entry
/// there and would still fail with a keychain-only callback.
///
/// Without any callback libgit2 reports "no callback set" (#379). A desktop
/// launch hits that whenever the system-git attempt fails first: a GUI process
/// has a leaner PATH than a shell and cannot prompt, so it falls through to
/// libgit2 — which is why the same skill checks fine from the CLI.
///
/// Each source is offered once. libgit2 re-invokes this callback after every
/// rejection, so a source that answers unconditionally would spin forever.
pub fn install_git2_credentials(callbacks: &mut git2::RemoteCallbacks<'_>, url: &str) {
    // Resolve the host now, but read the keychain only from inside the callback:
    // libgit2 invokes it solely when the remote actually demands credentials, and
    // almost every skill source is a public repository that never will. Reading
    // eagerly would touch the keychain on every update check for nothing — and on
    // macOS each unsigned build that does so raises an authorization prompt.
    let host = https_host(url);
    let host_label = host.clone().unwrap_or_else(|| "this remote".to_string());
    let mut tried_stored = false;
    let mut tried_helper = false;
    let mut tried_agent = false;

    callbacks.credentials(move |url, username_from_url, allowed| {
        if allowed.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
            if !tried_stored {
                tried_stored = true;
                if let Some(cred) = host
                    .as_deref()
                    .and_then(|h| super::git_auth_source::resolve(h).ok().flatten())
                {
                    return git2::Cred::userpass_plaintext(&cred.username, &cred.password);
                }
            }
            if !tried_helper {
                tried_helper = true;
                if let Ok(config) = git2::Config::open_default() {
                    if let Ok(cred) = git2::Cred::credential_helper(&config, url, username_from_url)
                    {
                        return Ok(cred);
                    }
                }
            }
        }
        if allowed.contains(git2::CredentialType::SSH_KEY) && !tried_agent {
            tried_agent = true;
            if let Some(user) = username_from_url {
                return git2::Cred::ssh_key_from_agent(user);
            }
        }
        if allowed.contains(git2::CredentialType::DEFAULT) {
            return git2::Cred::default();
        }
        // Phrased for the user, not for libgit2: this string reaches the UI.
        Err(git2::Error::from_str(&format!(
            "Authentication failed: no credentials available for {host_label}. \
             Sign in to that host with git (for example `gh auth setup-git` for \
             GitHub), then check for updates again."
        )))
    });
}

// Git invokes this helper before considering interactive prompts. Values live
// only in the child environment; get is host-scoped, store/erase are no-ops.
const CREDENTIAL_HELPER: &str = r#"!f() {
  [ "$1" = get ] || return 0
  h=; p=
  while IFS= read -r line && [ -n "$line" ]; do
    case "$line" in host=*) h=${line#host=} ;; protocol=*) p=${line#protocol=} ;; esac
  done
  [ "$h" = "$AGENT_HUB_CREDENTIAL_HOST" ] || return 0
  case "$p" in http|https) printf 'username=%s\npassword=%s\n\n' "$AGENT_HUB_ASKPASS_USERNAME" "$AGENT_HUB_ASKPASS_PASSWORD" ;; esac
}; f"#;

/// Environment to inject into a git subprocess so it can authenticate against
/// `url` without credentials on disk. Empty when not applicable: non-http(s)
/// URL, URL still carrying embedded userinfo (git uses it directly), or no
/// stored credential for the host.
pub fn credential_env_for_url(url: &str) -> Vec<(String, String)> {
    let Some(host) = https_host(url) else {
        return Vec::new();
    };
    if split_credentials_from_url(url).is_some() {
        return Vec::new();
    }
    let cred = match super::git_auth_source::resolve(&host) {
        Ok(Some(cred)) => cred,
        Ok(None) => return Vec::new(),
        Err(e) => {
            log::warn!("git credentials: credential lookup failed for {host}: {e:#}");
            return Vec::new();
        }
    };
    credential_env(cred, &host)
}

fn credential_env(cred: RemoteCredential, host: &str) -> Vec<(String, String)> {
    // Preserve inherited config while replacing interactive credential helpers.
    let config_count = std::env::var("GIT_CONFIG_COUNT")
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    vec![
        ("AGENT_HUB_CREDENTIAL_HOST".to_string(), host.to_string()),
        (ENV_USERNAME.to_string(), cred.username),
        (ENV_PASSWORD.to_string(), cred.password),
        ("GIT_TERMINAL_PROMPT".to_string(), "0".to_string()),
        (
            "GIT_CONFIG_COUNT".to_string(),
            (config_count + 2).to_string(),
        ),
        (
            format!("GIT_CONFIG_KEY_{config_count}"),
            "credential.helper".to_string(),
        ),
        (format!("GIT_CONFIG_VALUE_{config_count}"), String::new()),
        (
            format!("GIT_CONFIG_KEY_{}", config_count + 1),
            "credential.helper".to_string(),
        ),
        (
            format!("GIT_CONFIG_VALUE_{}", config_count + 1),
            CREDENTIAL_HELPER.to_string(),
        ),
    ]
}

/// Route all keyring access in this test process to keyring's in-memory mock
/// store, so tests never touch the developer's real OS keychain.
#[cfg(test)]
pub(crate) fn use_mock_keyring() {
    static INIT: std::sync::Once = std::sync::Once::new();
    INIT.call_once(|| {
        keyring::set_default_credential_builder(keyring::mock::default_credential_builder());
    });
}

#[cfg(test)]
mod tests {
    #[test]
    fn persisted_credentials_skip_keychain_after_restart_and_logout() {
        let _lock = central_repo::test_base_dir_lock();
        let tmp = tempfile::tempdir().unwrap();
        central_repo::set_test_base_dir_override(Some(tmp.path().to_owned()));
        let credential = RemoteCredential {
            username: "fixture".into(),
            password: "fixture-password".into(),
        };
        assert_eq!(
            load_persistent("example.invalid", || Ok(Some(credential.clone()))).unwrap(),
            Some(credential.clone())
        );
        for _ in 0..3 {
            // Bypass memory to simulate fresh processes / development rebuilds.
            assert_eq!(
                load_persistent("example.invalid", || panic!("keychain read repeated")).unwrap(),
                Some(credential.clone())
            );
        }
        delete_credential("example.invalid").unwrap();
        assert_eq!(
            load_persistent("example.invalid", || panic!(
                "legacy credential resurrected after logout"
            ))
            .unwrap(),
            None
        );
        central_repo::set_test_base_dir_override(None);
    }
    #[cfg(unix)]
    #[test]
    fn cached_app_credentials_bypass_system_helper_reads_and_writes() {
        use std::io::Write;
        use std::process::{Command, Stdio};

        let tmp = tempfile::tempdir().unwrap();
        let config = tmp.path().join("gitconfig");
        std::fs::write(&config, "[credential]\nhelper = !touch helper-called\n").unwrap();
        let env = credential_env(
            RemoteCredential {
                username: "fixture".into(),
                password: "fixture-password".into(),
            },
            "example.invalid",
        );
        for operation in ["fill", "fill", "approve", "reject"] {
            let mut child = Command::new("git")
                .current_dir(tmp.path())
                .args(["credential", operation])
                .env("GIT_CONFIG_GLOBAL", &config)
                .env("GIT_CONFIG_NOSYSTEM", "1")
                .envs(env.iter().cloned())
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap();
            let mut input = child.stdin.take().unwrap();
            input
                .write_all(b"protocol=https\nhost=example.invalid\n")
                .unwrap();
            if operation != "fill" {
                input
                    .write_all(b"username=fixture\npassword=fixture-password\n")
                    .unwrap();
            }
            input.write_all(b"\n").unwrap();
            drop(input);
            let output = child.wait_with_output().unwrap();
            assert!(output.status.success());
            if operation == "fill" {
                let response = String::from_utf8(output.stdout).unwrap();
                assert!(response.contains("username=fixture\n"));
                assert!(response.contains("password=fixture-password\n"));
            }
            assert!(
                !tmp.path().join("helper-called").exists(),
                "{operation} called system helper"
            );
        }
    }
    /// The regression #379 reports: libgit2 got `None` for callbacks and
    /// answered "no callback set", which reached the user verbatim.
    ///
    /// Uses a host this app never stores credentials for, so it exercises the
    /// helper fallback and the final message without reading the app's own
    /// keychain entry — a test binary is unsigned and reading that entry would
    /// block on a macOS authorization prompt.
    #[test]
    #[ignore = "hits the network"]
    fn libgit2_is_given_a_credentials_callback() {
        let dir = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init_bare(dir.path()).unwrap();
        let url = "https://gitlab.com/agent-hub-no-such-owner/nope.git";
        let mut remote = repo.remote_anonymous(url).unwrap();
        let mut callbacks = git2::RemoteCallbacks::new();
        install_git2_credentials(&mut callbacks, url);

        // RemoteConnection is not Debug, so unwrap the error by hand.
        let msg = match remote.connect_auth(git2::Direction::Fetch, Some(callbacks), None) {
            Ok(_) => panic!("a private remote must not connect anonymously"),
            Err(e) => e.to_string(),
        };

        assert!(
            !msg.contains("no callback set"),
            "libgit2 still has no credentials callback: {msg}"
        );
    }

    use super::*;

    #[test]
    fn split_extracts_user_and_password() {
        let (cred, sanitized) =
            split_credentials_from_url("https://alice:s3cret@github.com/acme/repo.git").unwrap();
        assert_eq!(cred.username, "alice");
        assert_eq!(cred.password, "s3cret");
        assert_eq!(sanitized, "https://github.com/acme/repo.git");
    }

    #[test]
    fn split_extracts_token_only_form() {
        let (cred, sanitized) =
            split_credentials_from_url("https://ghp_token123@github.com/acme/repo.git").unwrap();
        assert_eq!(cred.username, "ghp_token123");
        assert_eq!(cred.password, "");
        assert_eq!(sanitized, "https://github.com/acme/repo.git");
    }

    #[test]
    fn split_decodes_percent_encoding() {
        let (cred, _) =
            split_credentials_from_url("https://user:p%40ss%2Fword@example.com/r.git").unwrap();
        assert_eq!(cred.password, "p@ss/word");
    }

    #[test]
    fn split_none_without_userinfo() {
        assert!(split_credentials_from_url("https://github.com/acme/repo.git").is_none());
    }

    #[test]
    fn split_none_for_ssh() {
        assert!(split_credentials_from_url("git@github.com:acme/repo.git").is_none());
        assert!(split_credentials_from_url("ssh://git@github.com/acme/repo.git").is_none());
    }

    #[test]
    fn split_keeps_port_and_path() {
        let (_, sanitized) =
            split_credentials_from_url("https://u:p@gitlab.example.com:8443/g/r.git").unwrap();
        assert_eq!(sanitized, "https://gitlab.example.com:8443/g/r.git");
    }

    #[test]
    fn https_host_strips_userinfo_and_lowercases() {
        assert_eq!(
            https_host("https://u:p@GitHub.com/acme/repo.git").as_deref(),
            Some("github.com")
        );
        assert_eq!(
            https_host("https://gitlab.example.com:8443/g/r.git").as_deref(),
            Some("gitlab.example.com:8443")
        );
        assert_eq!(https_host("git@github.com:acme/repo.git"), None);
    }
}
