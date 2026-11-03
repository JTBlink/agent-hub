//! Explicit recovery only: terminate the browser holding one managed profile.
use super::{browser::Browsers, runtime};
use crate::core::error::AppError;
use std::{
    path::Path,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use sysinfo::{Pid, Process, ProcessRefreshKind, System, UpdateKind};

fn process_details() -> ProcessRefreshKind {
    ProcessRefreshKind::new()
        .with_cmd(UpdateKind::Always)
        .with_exe(UpdateKind::Always)
}

impl Browsers {
    pub fn kill_profile_process(&self, id: &str) -> Result<(), AppError> {
        let profile = self
            .profiles()?
            .into_iter()
            .find(|profile| profile.id == id)
            .ok_or_else(|| AppError::not_found("Browser profile unavailable"))?;
        runtime::validate_profile(&profile)?;
        if profile.ephemeral || profile.endpoint.is_some() || profile.deleting {
            return Err(AppError::invalid_input(
                "Only a local saved browser profile can be recovered",
            ));
        }
        let gate = self
            .state
            .lock()
            .map_err(|_| AppError::internal("Browser state unavailable"))?
            .starting
            .entry(id.into())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone();
        let _gate = gate
            .lock()
            .map_err(|_| AppError::internal("Browser startup unavailable"))?;
        {
            let state = self
                .state
                .lock()
                .map_err(|_| AppError::internal("Browser state unavailable"))?;
            if state.closing
                || state.runtimes.contains_key(id)
                || state.pending.values().any(|profile| profile == id)
                || state.reopening_profiles.contains_key(id)
            {
                return Err(AppError::invalid_input(
                    "Close this profile's active pages before recovery",
                ));
            }
        }
        let executable = profile
            .executable
            .filter(|value| !value.trim().is_empty())
            .map(std::path::PathBuf::from)
            .or_else(runtime::discover)
            .ok_or_else(|| AppError::not_found("PREVIEW_BROWSER_NOT_FOUND"))?;
        terminate(&self.root.join("profiles").join(id), &executable)
    }
}

fn matches(process: &Process, directory: &Path, executable: &Path) -> bool {
    let argument = format!("--user-data-dir={}", directory.display());
    process.pid() != Pid::from_u32(std::process::id())
        && process
            .exe()
            .and_then(|path| path.canonicalize().ok())
            .as_deref()
            == Some(executable)
        && process.cmd().iter().any(|arg| arg == &argument)
        && process.cmd().iter().any(|arg| arg == "--headless=new")
        && process
            .cmd()
            .iter()
            .any(|arg| arg == "--remote-debugging-port=0")
        && !process.cmd().iter().any(|arg| arg.starts_with("--type="))
}

fn terminate(directory: &Path, executable: &Path) -> Result<(), AppError> {
    let executable = executable.canonicalize()?;
    let mut system = System::new();
    system.refresh_processes_specifics(process_details());
    // Exact executable and profile arguments prevent touching normal browsers or other profiles.
    let mut targets: Vec<_> = system
        .processes()
        .values()
        .filter(|process| matches(process, directory, &executable))
        .map(|process| process.pid())
        .collect();
    loop {
        let children: Vec<_> = system
            .processes()
            .values()
            .filter(|process| {
                process
                    .parent()
                    .is_some_and(|parent| targets.contains(&parent))
                    && !targets.contains(&process.pid())
            })
            .map(|process| process.pid())
            .collect();
        if children.is_empty() {
            break;
        }
        targets.extend(children);
    }
    let identities: Vec<_> = targets
        .iter()
        .filter_map(|pid| {
            system.process(*pid).map(|process| {
                (
                    *pid,
                    process.start_time(),
                    process.exe().map(Path::to_path_buf),
                    process.cmd().to_vec(),
                )
            })
        })
        .collect();
    // Stop roots first so they cannot launch replacements while their children are being killed.
    // Recheck identity immediately before each signal to guard against PID reuse.
    for (pid, started, exe, cmd) in &identities {
        if !system.refresh_process_specifics(*pid, process_details()) {
            continue;
        }
        if let Some(process) = system.process(*pid).filter(|process| {
            process.start_time() == *started
                && process.exe() == exe.as_deref()
                && process.cmd() == cmd
        }) {
            if !process.kill() {
                return Err(AppError::io("Could not terminate the old preview process"));
            }
        }
    }
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut exited_once = false;
    loop {
        // A fresh process record is needed on macOS: sysinfo 0.30 retains the
        // original BSD status when refreshing an existing record, including zombies.
        system = System::new();
        let alive = identities.iter().any(|(pid, started, _, _)| {
            system.refresh_process_specifics(*pid, process_details())
                && system.process(*pid).is_some_and(|process| {
                    process.start_time() == *started
                        && process.status() != sysinfo::ProcessStatus::Zombie
                })
        });
        if !alive && exited_once {
            return Ok(());
        }
        exited_once = !alive;
        if Instant::now() >= deadline {
            return Err(AppError::network(
                "Old preview process has not exited; retry recovery",
            ));
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

#[cfg(test)]
mod tests;
