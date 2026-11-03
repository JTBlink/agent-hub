use super::*;

#[test]
fn refuses_unknown_remote_guest_and_currently_active_profiles() {
    let root = tempfile::tempdir().unwrap();
    let browsers = Browsers::new(root.path().into());
    assert!(browsers.kill_profile_process("../outside").is_err());
    assert!(browsers.kill_profile_process("guest").is_err());
    let profile = runtime::BrowserProfile {
        id: "remote".into(),
        endpoint: Some("http://127.0.0.1:9222".into()),
        ..runtime::BrowserProfile::default()
    };
    browsers.save_profile(profile).unwrap();
    assert!(browsers.kill_profile_process("remote").is_err());
    browsers
        .state
        .lock()
        .unwrap()
        .pending
        .insert("page".into(), "default".into());
    assert!(browsers.kill_profile_process("default").is_err());
}

#[test]
#[ignore = "requires local Chromium; run explicitly for profile recovery acceptance"]
fn recovers_a_real_chromium_profile_lock_and_reopens_the_saved_profile() {
    use super::runtime::{OwnedChild, Runtime};
    use std::process::{Command, Stdio};
    let executable = runtime::discover().expect("local Chromium is required");
    let root = tempfile::tempdir().unwrap();
    let directory = root.path().join("profiles/default");
    std::fs::create_dir_all(&directory).unwrap();
    let data = directory.join("login-sentinel");
    std::fs::write(&data, b"synthetic saved login data").unwrap();
    let mut command = Command::new(&executable);
    command
        .args([
            "--headless=new",
            "--remote-debugging-port=0",
            "--remote-debugging-address=127.0.0.1",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-background-networking",
            "--use-mock-keychain",
            "--password-store=basic",
        ])
        .arg(format!("--user-data-dir={}", directory.display()))
        .arg("about:blank")
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let mut old = OwnedChild {
        process: command.spawn().unwrap(),
        _temporary_profile: None,
    };
    let deadline = Instant::now() + Duration::from_secs(15);
    while !directory.join("DevToolsActivePort").is_file() {
        assert!(
            old.process.try_wait().unwrap().is_none(),
            "fixture browser exited"
        );
        assert!(
            Instant::now() < deadline,
            "fixture browser startup timed out"
        );
        std::thread::sleep(Duration::from_millis(50));
    }
    let profile = runtime::BrowserProfile {
        executable: Some(executable.to_string_lossy().into_owned()),
        ..runtime::BrowserProfile::default()
    };
    let spawn = |command: &mut Command, temporary| {
        Ok(Arc::new(Mutex::new(OwnedChild {
            process: command.spawn().map_err(AppError::io)?,
            _temporary_profile: temporary,
        })))
    };
    let other_root = tempfile::tempdir().unwrap();
    let other = Runtime::start(other_root.path(), &profile, spawn).unwrap();
    let blocked = Runtime::start(root.path(), &profile, spawn);
    assert!(matches!(blocked, Err(error) if error.message.contains("PREVIEW_PROFILE_IN_USE")));
    let browsers = Browsers::new(root.path().into());
    browsers.kill_profile_process("default").unwrap();
    let deadline = Instant::now() + Duration::from_secs(3);
    while old.process.try_wait().unwrap().is_none() {
        assert!(
            Instant::now() < deadline,
            "browser must exit after recovery"
        );
        std::thread::sleep(Duration::from_millis(20));
    }
    assert!(!old.process.wait().unwrap().success());
    let reopened = Runtime::start(root.path(), &profile, spawn)
        .expect("retry must open the same saved profile");
    assert_eq!(std::fs::read(data).unwrap(), b"synthetic saved login data");
    assert!(
        !other.owned_process_exited().unwrap(),
        "other profiles must keep running"
    );
    drop(other);
    drop(reopened);
}
