//! User-scoped native schedules. Generated wrappers do not depend on an open
//! desktop window or on a separately installed AgentHub CLI.
use super::{
    definition::{ManagedAutomation, Schedule},
    process::read_command,
    store,
};
use std::path::{Path, PathBuf};
pub(super) mod bundle_files;
pub(super) mod payload;
mod render;
mod run_script;

pub(super) fn python_runtime() -> Result<PathBuf, String> {
    for name in ["python3", "python"] {
        if let Some(path) = super::super::tool_detection::find_command(name) {
            if read_command(&path.to_string_lossy(), &["--version"])
                .is_ok_and(|version| version.trim().starts_with("Python 3."))
            {
                return Ok(path);
            }
        }
    }
    Err("Python 3 is required for bundled automation scripts; install Python 3 and restart AgentHub".into())
}

pub(super) fn source() -> &'static str {
    if cfg!(target_os = "macos") {
        "launchd"
    } else if cfg!(windows) {
        "windows"
    } else {
        "systemd"
    }
}

pub(super) fn label(task: &ManagedAutomation) -> String {
    format!(
        "com.jtstudio.agenthub.automation.{}",
        task.id.trim_start_matches("agent_hub:")
    )
}

pub(super) fn paths(root: &Path, task: &ManagedAutomation) -> Result<(String, PathBuf), String> {
    let home = dirs::home_dir().ok_or("Cannot resolve user home")?;
    let label = label(task);
    if cfg!(target_os = "macos") {
        Ok((
            label.clone(),
            home.join("Library/LaunchAgents")
                .join(format!("{label}.plist")),
        ))
    } else if cfg!(windows) {
        let name = format!("\\AgentHub\\{label}");
        Ok((name.clone(), PathBuf::from(name)))
    } else {
        let config = dirs::config_dir().unwrap_or_else(|| home.join(".config"));
        let unit = format!("{label}.timer");
        let _ = root;
        Ok((unit.clone(), config.join("systemd/user").join(unit)))
    }
}

pub(super) fn directory(root: &Path, task: &ManagedAutomation) -> PathBuf {
    root.join(task.id.trim_start_matches("agent_hub:"))
}

pub(super) fn apply(root: &Path, task: &ManagedAutomation) -> Result<(), String> {
    if is_running(task) {
        return Err("Wait for the current run to finish before editing".into());
    }
    let dir = checked_directory(root, task)?;
    if !task.draft.files.is_empty() {
        python_runtime()?;
    }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    super::super::path_guard::ensure_dir_within_root(&dir, root).map_err(|e| e.to_string())?;
    let wrapper = render::scripts(&dir, &task.draft, &task.id, true)?;
    let (identifier, location) = paths(root, task)?;
    if cfg!(target_os = "macos") {
        let domain = format!("gui/{}", uid()?);
        if read_command(
            "/bin/launchctl",
            &["print", &format!("{domain}/{identifier}")],
        )
        .is_ok()
        {
            read_command(
                "/bin/launchctl",
                &["bootout", &format!("{domain}/{identifier}")],
            )?;
        }
        store::write(&location, &render::launchd(task, &wrapper)?)?;
        read_command(
            "/bin/launchctl",
            &["bootstrap", &domain, &location.to_string_lossy()],
        )?;
    } else if cfg!(windows) {
        let xml = dir.join("task.xml");
        let sid = read_command(
            "powershell.exe",
            &[
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "[Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
            ],
        )?;
        let sid = sid.trim();
        if !sid.starts_with("S-1-")
            || !sid
                .bytes()
                .all(|c| c == b'S' || c == b'-' || c.is_ascii_digit())
        {
            return Err("Cannot resolve current Windows user SID".into());
        }
        store::write(&xml, render::windows(task, &wrapper, sid).as_bytes())?;
        read_command(
            "schtasks.exe",
            &[
                "/Create",
                "/TN",
                &identifier,
                "/XML",
                &xml.to_string_lossy(),
                "/F",
            ],
        )?;
    } else {
        let service = location.with_extension("service");
        store::write(&service, render::systemd_service(&wrapper).as_bytes())?;
        let scheduled = task.draft.enabled && !matches!(task.draft.schedule, Schedule::Manual);
        // Only stop an existing timer; never stop a currently executing service.
        if location.exists() {
            read_command("systemctl", &["--user", "disable", "--now", &identifier])?;
        }
        if matches!(task.draft.schedule, Schedule::Manual) {
            if location.exists() {
                std::fs::remove_file(&location).map_err(|e| e.to_string())?;
            }
        } else {
            store::write(&location, render::systemd_timer(task).as_bytes())?;
        }
        read_command("systemctl", &["--user", "daemon-reload"])?;
        if scheduled {
            read_command("systemctl", &["--user", "enable", "--now", &identifier])?;
        }
    }
    Ok(())
}

pub(super) fn run(root: &Path, task: &ManagedAutomation) -> Result<(), String> {
    if is_running(task) {
        return Err("This task is already running".into());
    }
    refresh_runner(root, task)?;
    if cfg!(target_os = "macos") {
        read_command(
            "/bin/launchctl",
            &["kickstart", &format!("gui/{}/{}", uid()?, task.identifier)],
        )?;
    } else if cfg!(windows) {
        read_command("schtasks.exe", &["/Run", "/TN", &task.identifier])?;
    } else {
        read_command(
            "systemctl",
            &[
                "--user",
                "start",
                "--no-block",
                &task.identifier.replace(".timer", ".service"),
            ],
        )?;
    }
    Ok(())
}

pub(super) fn is_running(task: &ManagedAutomation) -> bool {
    state(task) == Some(true)
}

pub(super) fn state(task: &ManagedAutomation) -> Option<bool> {
    if cfg!(target_os = "macos") {
        uid()
            .and_then(|uid| {
                read_command(
                    "/bin/launchctl",
                    &["print", &format!("gui/{uid}/{}", task.identifier)],
                )
            })
            .ok()
            .map(|text| text.lines().any(|l| l.trim() == "state = running"))
    } else if cfg!(windows) {
        let query = format!("$ErrorActionPreference='Stop'; [string](Get-ScheduledTask -TaskPath '\\AgentHub\\' -TaskName '{}').State", label(task));
        read_command(
            "powershell.exe",
            &["-NoProfile", "-NonInteractive", "-Command", &query],
        )
        .ok()
        .map(|text| text.trim() == "Running")
    } else {
        let text = read_command(
            "systemctl",
            &[
                "--user",
                "show",
                "--property=ActiveState,LoadState",
                &task.identifier.replace(".timer", ".service"),
            ],
        )
        .ok()?;
        if !text.lines().any(|line| line == "LoadState=loaded") {
            return None;
        }
        Some(
            text.lines()
                .any(|line| matches!(line, "ActiveState=active" | "ActiveState=activating")),
        )
    }
}

pub(super) fn remove(root: &Path, task: &ManagedAutomation) -> Result<(), String> {
    if is_running(task) {
        return Err("Wait for the current run to finish before deleting".into());
    }
    let (identifier, location) = paths(root, task)?;
    if cfg!(target_os = "macos") {
        let job = format!("gui/{}/{}", uid()?, identifier);
        if read_command("/bin/launchctl", &["print", &job]).is_ok() {
            read_command("/bin/launchctl", &["bootout", &job])?;
        }
    } else if cfg!(windows) {
        read_command("schtasks.exe", &["/Delete", "/TN", &identifier, "/F"])?;
    } else {
        if location.exists() {
            read_command("systemctl", &["--user", "disable", "--now", &identifier])?;
        }
    }
    if !cfg!(windows) && location.exists() {
        std::fs::remove_file(&location).map_err(|e| e.to_string())?;
    }
    if !cfg!(target_os = "macos") && !cfg!(windows) {
        let service = location.with_extension("service");
        if service.exists() {
            std::fs::remove_file(service).map_err(|e| e.to_string())?;
        }
        read_command("systemctl", &["--user", "daemon-reload"])?;
    }
    Ok(())
}

fn uid() -> Result<String, String> {
    read_command("/usr/bin/id", &["-u"]).map(|s| s.trim().to_owned())
}

/// Upgrade an owned standalone runner without changing its schedule.
pub(super) fn refresh_runner(root: &Path, task: &ManagedAutomation) -> Result<(), String> {
    let dir = checked_directory(root, task)?;
    render::scripts(&dir, &task.draft, &task.id, false).map(|_| ())
}
pub(super) fn needs_upgrade(root: &Path, task: &ManagedAutomation) -> bool {
    let wrapper = directory(root, task).join(if cfg!(windows) { "run.ps1" } else { "run.sh" });
    std::fs::read_to_string(wrapper).is_ok_and(|script| !script.contains(run_script::VERSION))
}

fn checked_directory(root: &Path, task: &ManagedAutomation) -> Result<PathBuf, String> {
    let dir = directory(root, task);
    if !crate::core::path_guard::is_path_safe(root, &dir) || dir.is_symlink() {
        return Err("Automation runner is outside its storage directory".into());
    }
    Ok(dir)
}
