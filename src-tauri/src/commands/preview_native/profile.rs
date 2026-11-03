//! Native profiles belong to the preview module, independent of projects and Chromium data.
use super::*;
fn root() -> std::path::PathBuf {
    crate::core::central_repo::home_base_dir().join("preview-native")
}
pub fn validate_ua(value: Option<&str>) -> Result<(), AppError> {
    if value.is_some_and(|value| {
        value.is_empty() || value.len() > 2048 || value.chars().any(char::is_control)
    }) {
        return Err(AppError::invalid_input("Invalid User-Agent"));
    }
    Ok(())
}
pub fn read_ua() -> Result<Option<String>, AppError> {
    let path = root().join("profile.json");
    if !path.exists() {
        return Ok(None);
    }
    if std::fs::metadata(&path)?.len() > 4096 {
        return Err(AppError::invalid_input(
            "Native profile settings exceed limit",
        ));
    }
    let value: serde_json::Value =
        serde_json::from_slice(&std::fs::read(path)?).map_err(AppError::io)?;
    let ua = value["userAgent"].as_str().map(str::to_owned);
    validate_ua(ua.as_deref())?;
    Ok(ua)
}
pub fn write_ua(value: Option<&str>) -> Result<(), AppError> {
    validate_ua(value)?;
    let root = root();
    std::fs::create_dir_all(&root)?;
    let mut file = tempfile::NamedTempFile::new_in(&root)?;
    serde_json::to_writer(file.as_file_mut(), &serde_json::json!({"userAgent":value}))
        .map_err(AppError::io)?;
    file.persist(root.join("profile.json"))
        .map_err(AppError::io)?;
    Ok(())
}
pub fn persistent() -> bool {
    #[cfg(target_os = "macos")]
    {
        crate::core::cli_process::read_command("/usr/bin/sw_vers", &["-productVersion"])
            .ok()
            .and_then(|v| v.trim().split('.').next()?.parse::<u32>().ok())
            .is_some_and(|major| major >= 14)
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}
pub fn configure(
    mut builder: tauri::webview::WebviewBuilder<tauri::Wry>,
) -> Result<tauri::webview::WebviewBuilder<tauri::Wry>, AppError> {
    if persistent() {
        builder = builder.incognito(false);
        #[cfg(target_os = "macos")]
        {
            builder = builder.data_store_identifier([
                0x6a, 0x74, 0x73, 0x74, 0x75, 0x64, 0x69, 0x6f, 0x2d, 0x70, 0x72, 0x65, 0x76, 0x69,
                0x65, 0x77,
            ]);
        }
        #[cfg(not(target_os = "macos"))]
        {
            let path = root().join("profile");
            std::fs::create_dir_all(&path)?;
            builder = builder.data_directory(path);
        }
    }
    if let Some(ua) = read_ua()? {
        builder = builder.user_agent(&ua);
    }
    Ok(builder)
}
