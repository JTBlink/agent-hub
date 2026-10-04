//! Launch the independent, bundled Skills module. No legacy Skill writes live here.

use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

fn executable_path(host_executable: &Path) -> Result<PathBuf, String> {
    let parent = host_executable
        .parent()
        .ok_or("application directory is unavailable")?;
    Ok(parent.join(if cfg!(windows) {
        "skills-manager.exe"
    } else {
        "skills-manager"
    }))
}

/// Open the fixed bundled executable; the module focuses an existing instance.
#[tauri::command]
pub fn open_skills_manager() -> Result<(), String> {
    let host =
        tauri::utils::platform::current_exe().map_err(|_| "application path is unavailable")?;
    let executable = executable_path(&host)?;
    if !executable.is_file() {
        return Err("Skills module is missing; rebuild or reinstall AgentHub".into());
    }
    let mut child = Command::new(executable)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "Skills module could not be opened")?;
    // Reap the child independently; closing AgentHub must not kill the manager.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_only_the_sibling_module_executable() {
        let directory = tempfile::tempdir().unwrap();
        let host = directory.path().join("agent-hub");
        let result = executable_path(&host).unwrap();
        assert_eq!(result.parent(), Some(directory.path()));
        assert_eq!(
            result.file_name().unwrap(),
            if cfg!(windows) {
                "skills-manager.exe"
            } else {
                "skills-manager"
            }
        );
        assert!(!result.exists());
    }
}
