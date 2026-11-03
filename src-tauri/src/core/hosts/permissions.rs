//! Fixed OS settings destinations; no path, URL or command comes from the frontend.
use std::process::{Command, Stdio};

/// Open the operating system's permission settings without changing permissions.
pub fn open_settings() -> Result<(), String> {
    let mut command = settings_command()?;
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    // GUI settings can outlive this request. Reap the child without blocking IPC.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[cfg(target_os = "macos")]
fn settings_command() -> Result<Command, String> {
    let mut command = Command::new("/usr/bin/open");
    let version = crate::core::cli_process::read_command("/usr/bin/sw_vers", &["-productVersion"])?;
    let major = version
        .trim()
        .split('.')
        .next()
        .and_then(|value| value.parse().ok())
        .ok_or("Unable to identify the macOS settings version")?;
    command.arg(macos_settings_url(major));
    Ok(command)
}

/// Both URLs are documented by Apple's EndpointSecurity ESClient.h.
#[cfg(target_os = "macos")]
pub(super) fn macos_settings_url(major: u32) -> String {
    crate::core::system_permissions::macos_settings_url(
        crate::core::system_permissions::Permission::FullDisk,
        major,
    )
}

#[cfg(windows)]
fn settings_command() -> Result<Command, String> {
    let root = std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into());
    // ShellExecute (the Open verb) handles the settings executable's elevation
    // manifest; CreateProcess alone can fail with ERROR_ELEVATION_REQUIRED.
    let mut command = Command::new(
        std::path::PathBuf::from(root).join("System32/WindowsPowerShell/v1.0/powershell.exe"),
    );
    command.args(["-NoProfile", "-NonInteractive", "-Command",
        "Start-Process -FilePath (Join-Path $env:SystemRoot 'System32/UserAccountControlSettings.exe') -Verb Open -ErrorAction Stop"]);
    Ok(command)
}

#[cfg(target_os = "linux")]
fn settings_command() -> Result<Command, String> {
    use crate::core::tool_detection::find_command;
    let kde = std::env::var("XDG_CURRENT_DESKTOP")
        .unwrap_or_default()
        .to_ascii_lowercase()
        .contains("kde");
    let candidates = if kde {
        ["systemsettings", "systemsettings5", "gnome-control-center"]
    } else {
        ["gnome-control-center", "systemsettings", "systemsettings5"]
    };
    for name in candidates {
        if let Some(path) = find_command(name) {
            let mut command = Command::new(path);
            if name == "gnome-control-center" {
                if std::path::Path::new("/usr/share/applications/gnome-users-panel.desktop")
                    .exists()
                {
                    command.args(["system", "users"]);
                } else {
                    command.arg("user-accounts");
                }
            } else {
                command.arg("kcm_users");
            }
            return Ok(command);
        }
    }
    Err("HOSTS_SETTINGS_UNAVAILABLE".into())
}

#[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
fn settings_command() -> Result<Command, String> {
    Err("HOSTS_SETTINGS_UNAVAILABLE".into())
}
