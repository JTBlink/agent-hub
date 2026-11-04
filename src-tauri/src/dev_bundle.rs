//! Give `tauri dev` a real application bundle so Dock uses the product name.

use std::os::unix::{fs::symlink, process::CommandExt};
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

    // Cargo replaces its output on rebuild. A hard link avoids copying the large
    // debug executable and keeps the running image valid until the next restart.
    let staged = directory.join(".agent-hub.staged");
    if staged.exists() {
        std::fs::remove_file(&staged)?;
    }
    std::fs::hard_link(executable, &staged)?;
    std::fs::rename(staged, &bundled)?;
    let cli = directory.join("agent-hub-cli");
    if cli.symlink_metadata().is_ok() {
        std::fs::remove_file(&cli)?;
    }
    symlink(executable.with_file_name("agent-hub-cli"), cli)?;

    Ok(Some(bundled))
}

#[cfg(test)]
#[path = "dev_bundle_tests.rs"]
mod tests;
