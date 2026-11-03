//! Read-only OS permission diagnostics and allowlisted settings links.
use serde::{Deserialize, Serialize};
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Permission {
    Accessibility,
    ScreenCapture,
    FilesFolders,
    FullDisk,
}
#[derive(Serialize)]
pub struct Status {
    platform: &'static str,
    accessibility: Option<bool>,
    screen_capture: Option<bool>,
}
pub fn status() -> Status {
    #[cfg(target_os = "macos")]
    {
        #[link(name = "ApplicationServices", kind = "framework")]
        extern "C" {
            fn AXIsProcessTrusted() -> u8;
        }
        #[link(name = "CoreGraphics", kind = "framework")]
        extern "C" {
            fn CGPreflightScreenCaptureAccess() -> bool;
        }
        // Preflight only: these APIs never present a grant prompt or change TCC.
        Status {
            platform: "macos",
            accessibility: Some(unsafe { AXIsProcessTrusted() != 0 }),
            screen_capture: Some(unsafe { CGPreflightScreenCaptureAccess() }),
        }
    }
    #[cfg(not(target_os = "macos"))]
    Status {
        platform: std::env::consts::OS,
        accessibility: None,
        screen_capture: None,
    }
}
pub fn macos_settings_url(permission: Permission, major: u32) -> String {
    let pane = if major >= 13 {
        "com.apple.settings.PrivacySecurity.extension"
    } else {
        "com.apple.preference.security"
    };
    let section = match permission {
        Permission::Accessibility => "Privacy_Accessibility",
        Permission::ScreenCapture => "Privacy_ScreenCapture",
        Permission::FilesFolders => "Privacy_FilesAndFolders",
        Permission::FullDisk => "Privacy_AllFiles",
    };
    format!("x-apple.systempreferences:{pane}?{section}")
}
pub fn open_settings(permission: Permission) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::{Command, Stdio};
        let version =
            crate::core::cli_process::read_command("/usr/bin/sw_vers", &["-productVersion"])?;
        let major = version
            .trim()
            .split('.')
            .next()
            .and_then(|value| value.parse().ok())
            .ok_or("Unable to identify macOS version")?;
        let mut child = Command::new("/usr/bin/open")
            .arg(macos_settings_url(permission, major))
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;
        std::thread::spawn(move || {
            let _ = child.wait();
        });
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = permission;
        Err("PERMISSION_SETTINGS_UNAVAILABLE".into())
    }
}
#[cfg(test)]
mod tests;
