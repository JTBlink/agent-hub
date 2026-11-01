#[test]
fn local_credentials_work_without_legacy_keychain_access() {
    let _lock = central_repo::test_base_dir_lock();
    let tmp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(tmp.path().to_owned()));
    struct Reset;
    impl Drop for Reset {
        fn drop(&mut self) {
            central_repo::set_test_base_dir_override(None);
        }
    }
    let _reset = Reset;
    assert_eq!(
        load_persistent("example.invalid", false, || panic!(
            "legacy Keychain accessed"
        ))
        .unwrap(),
        None
    );
    assert_eq!(
        super::super::credential_file::read("example.invalid").unwrap(),
        None
    );
    let credential = RemoteCredential {
        username: "fixture".into(),
        password: "fixture-password".into(),
    };
    super::super::credential_file::write("example.invalid", Some(&credential)).unwrap();
    assert_eq!(
        load_persistent("example.invalid", false, || panic!(
            "local credential ignored"
        ))
        .unwrap(),
        Some(credential)
    );
}

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
        load_persistent("example.invalid", true, || Ok(Some(credential.clone()))).unwrap(),
        Some(credential.clone())
    );
    for _ in 0..3 {
        // Bypass memory to simulate fresh processes / development rebuilds.
        assert_eq!(
            load_persistent("example.invalid", true, || panic!("keychain read repeated")).unwrap(),
            Some(credential.clone())
        );
    }
    delete_credential("example.invalid").unwrap();
    assert_eq!(
        load_persistent("example.invalid", true, || panic!(
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
