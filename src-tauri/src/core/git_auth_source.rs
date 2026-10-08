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
        USE_GH.load(Ordering::Relaxed),
        super::gh_credentials::load,
        || git_credentials::load_credential(host),
    )
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
mod tests {
    use super::*;
    fn credential(value: &str) -> RemoteCredential {
        RemoteCredential {
            username: "fixture".into(),
            password: value.into(),
        }
    }
    #[test]
    fn github_session_takes_precedence_over_stale_app_token_without_reading_app_store() {
        let chosen = select(
            "github.com",
            true,
            || Some(credential("gh-fixture")),
            || panic!("stale app credential must not be read when gh is authenticated"),
        )
        .unwrap()
        .unwrap();
        assert_eq!(chosen.password, "gh-fixture");
    }
    #[test]
    fn absent_gh_falls_back_and_other_hosts_never_receive_github_token() {
        assert_eq!(
            select(
                "github.com",
                true,
                || None,
                || Ok(Some(credential("app-fixture")))
            )
            .unwrap()
            .unwrap()
            .password,
            "app-fixture"
        );
        assert_eq!(
            select(
                "git.example.invalid",
                true,
                || panic!("must not query gh for another host"),
                || Ok(Some(credential("other-fixture")))
            )
            .unwrap()
            .unwrap()
            .password,
            "other-fixture"
        );
    }
    #[test]
    fn disabled_preference_never_reads_cli_login() {
        for value in ["off", "false", "0", " no "] {
            let chosen = select(
                "github.com",
                preference_enabled(Some(value)),
                || panic!("disabled gh must not be invoked"),
                || Ok(Some(credential("app-fixture"))),
            )
            .unwrap()
            .unwrap();
            assert_eq!(chosen.password, "app-fixture");
        }
        assert!(preference_enabled(None));
        assert!(preference_enabled(Some("on")));
    }

    #[test]
    fn app_credential_works_when_git_interactive_prompts_are_disabled() {
        use crate::core::central_repo;
        use std::{
            io::Write,
            process::{Command, Stdio},
        };
        let _lock = central_repo::test_base_dir_lock();
        git_credentials::use_mock_keyring();
        let temp = tempfile::tempdir().unwrap();
        central_repo::set_test_base_dir_override(Some(temp.path().into()));
        struct Reset;
        impl Drop for Reset {
            fn drop(&mut self) {
                central_repo::set_test_base_dir_override(None);
            }
        }
        let _reset = Reset;
        git_credentials::store_credential("example.invalid", &credential("app-fixture")).unwrap();
        let env = git_credentials::credential_env_for_url("https://example.invalid/repo.git");
        for (host, success) in [("example.invalid", true), ("another.invalid", false)] {
            let mut child = Command::new("git")
                .current_dir(temp.path())
                .args(["-c", "credential.interactive=false", "credential", "fill"])
                .envs(env.iter().cloned())
                .env("GIT_CONFIG_GLOBAL", temp.path().join("empty-config"))
                .env("GIT_CONFIG_NOSYSTEM", "1")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap();
            child
                .stdin
                .take()
                .unwrap()
                .write_all(format!("protocol=https\nhost={host}\n\n").as_bytes())
                .unwrap();
            let output = child.wait_with_output().unwrap();
            assert_eq!(output.status.success(), success, "host={host}");
            if success {
                assert!(String::from_utf8(output.stdout)
                    .unwrap()
                    .contains("password=app-fixture"));
            } else {
                assert!(!String::from_utf8(output.stdout)
                    .unwrap()
                    .contains("app-fixture"));
            }
        }
    }
}
