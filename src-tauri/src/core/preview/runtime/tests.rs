#[cfg(unix)]
use super::*;

#[cfg(unix)]
#[test]
fn identifies_profile_lock_failure_without_hiding_other_startup_errors() {
    use std::os::unix::fs::PermissionsExt;
    for (code, expected) in [
        (21, "PREVIEW_PROFILE_IN_USE"),
        (2, "Browser exited during startup"),
    ] {
        let root = tempfile::tempdir().unwrap();
        let executable = root.path().join("browser");
        fs::write(&executable, format!("#!/bin/sh\nexit {code}\n")).unwrap();
        fs::set_permissions(&executable, fs::Permissions::from_mode(0o700)).unwrap();
        let profile = BrowserProfile {
            executable: Some(executable.to_string_lossy().into_owned()),
            ..BrowserProfile::default()
        };
        let result = Runtime::start(root.path(), &profile, |command, temporary| {
            Ok(Arc::new(Mutex::new(OwnedChild {
                process: command.spawn().map_err(AppError::io)?,
                _temporary_profile: temporary,
            })))
        });
        let error = result
            .err()
            .expect("The failing browser must not become a runtime");
        assert!(error.message.contains(expected), "{}", error.message);
    }
}
