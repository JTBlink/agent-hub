//! Give `tauri dev` a real application bundle so Dock uses the product name.

use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};

fn bundle_executable(executable: &Path, name: &str) -> Option<PathBuf> {
    let directory = executable.parent()?;
    if directory.file_name()? == "MacOS"
        && directory.parent()?.file_name()? == "Contents"
        && directory.parent()?.parent()?.extension()? == "app"
    {
        return None;
    }
    Some(directory.join(format!("bundle/macos/{name}.app/Contents/MacOS/agent-hub")))
}

pub fn relaunch(config: &tauri::Config) -> Result<(), Box<dyn std::error::Error>> {
    let executable = std::env::current_exe()?;
    let Some(bundled) = prepare_bundle(&executable, config)? else {
        return Ok(());
    };
    // Replace this process so Tauri retains ownership of hot reload and shutdown.
    Err(std::process::Command::new(bundled)
        .args(std::env::args_os().skip(1))
        .exec()
        .into())
}

fn prepare_bundle(
    executable: &Path,
    config: &tauri::Config,
) -> Result<Option<PathBuf>, Box<dyn std::error::Error>> {
    let name = config.product_name.as_deref().unwrap_or("AgentHub");
    let Some(bundled) = bundle_executable(executable, name) else {
        return Ok(None);
    };
    let directory = bundled
        .parent()
        .ok_or("missing bundle executable directory")?;
    let contents = directory
        .parent()
        .ok_or("missing bundle contents directory")?;
    std::fs::create_dir_all(directory)?;
    std::fs::create_dir_all(contents.join("Resources"))?;

    let mut info = plist::Dictionary::new();
    for (key, value) in [
        ("CFBundleName", name),
        ("CFBundleDisplayName", name),
        ("CFBundleIdentifier", config.identifier.as_str()),
        ("CFBundleExecutable", "agent-hub"),
        ("CFBundlePackageType", "APPL"),
        ("CFBundleIconFile", "icon.icns"),
        (
            "NSDownloadsFolderUsageDescription",
            "Access files in Downloads when you open them or run commands in the integrated terminal.",
        ),
        (
            "CFBundleVersion",
            config.version.as_deref().unwrap_or("0.0.0"),
        ),
    ] {
        info.insert(key.into(), value.into());
    }
    plist::Value::Dictionary(info).to_file_xml(contents.join("Info.plist"))?;
    std::fs::write(
        contents.join("Resources/icon.icns"),
        include_bytes!("../icons/icon.icns"),
    )?;

    // Signing must never modify Cargo's executable or the running image through
    // a hard link. Stage independent files and replace the previous bundle copy.
    let staged = directory.join(".agent-hub.staged");
    if staged.exists() {
        std::fs::remove_file(&staged)?;
    }
    std::fs::copy(executable, &staged)?;
    std::fs::rename(staged, &bundled)?;
    let cli_name = app_lib::product::CLI_NAME;
    let cli = directory.join(cli_name);
    let staged_cli = directory.join(format!(".{cli_name}.staged"));
    if staged_cli.exists() {
        std::fs::remove_file(&staged_cli)?;
    }
    std::fs::copy(executable.with_file_name(cli_name), &staged_cli)?;
    if cli.symlink_metadata().is_ok() {
        std::fs::remove_file(&cli)?;
    }
    std::fs::rename(staged_cli, cli)?;

    // The linker signature does not seal Info.plist or resources. TCC needs a
    // valid app identity; an external CLI symlink also fails strict validation.
    let app = contents.parent().ok_or("missing development app bundle")?;
    sign_bundle(app, &config.identifier)?;

    Ok(Some(bundled))
}

fn sign_bundle(app: &Path, identifier: &str) -> Result<(), Box<dyn std::error::Error>> {
    let output = std::process::Command::new("/usr/bin/codesign")
        .args(["--force", "--sign", "-", "--timestamp=none", "--identifier"])
        .arg(identifier)
        .arg(app)
        .output()?;
    if !output.status.success() {
        return Err(format!(
            "Cannot sign macOS development app: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )
        .into());
    }
    let output = std::process::Command::new("/usr/bin/codesign")
        .args(["--verify", "--strict"])
        .arg(app)
        .output()?;
    if !output.status.success() {
        return Err(format!(
            "Invalid macOS development app signature: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )
        .into());
    }

    Ok(())
}

#[cfg(test)]
#[path = "dev_bundle_tests.rs"]
mod tests;
