//! Bounded, cancellable retrieval of owned remote downloads through OpenSSH SFTP.
use super::{
    browser::{Browsers, State},
    downloads::Download,
    runtime,
};
use crate::core::{cli_process, error::AppError, path_guard};
use serde::Serialize;
use std::{
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

const LIMIT: u64 = 512 * 1024 * 1024;
#[derive(Clone, Serialize)]
pub struct Progress {
    pub state: String,
    pub received: u64,
    pub error: Option<String>,
}
pub(super) struct Transfer {
    canceled: AtomicBool,
    received: AtomicU64,
    result: Mutex<Option<Result<(), String>>>,
}
impl Transfer {
    fn new() -> Self {
        Self {
            canceled: AtomicBool::new(false),
            received: AtomicU64::new(0),
            result: Mutex::new(None),
        }
    }
    pub fn cancel(&self) {
        self.canceled.store(true, Ordering::Release);
    }
    pub fn active(&self) -> bool {
        self.result
            .lock()
            .map(|value| value.is_none())
            .unwrap_or(false)
    }
    fn progress(&self) -> Progress {
        let result = self.result.lock().ok();
        let result = result.as_deref().and_then(|value| value.as_ref());
        let (state, error) = match result {
            Some(Ok(())) => ("completed", None),
            Some(Err(error)) if error == "canceled" => ("canceled", None),
            Some(Err(error)) => ("failed", Some(error.clone())),
            None if self.canceled.load(Ordering::Acquire) => ("canceling", None),
            None => ("running", None),
        };
        Progress {
            state: state.into(),
            received: self.received.load(Ordering::Relaxed),
            error,
        }
    }
}
pub(super) fn snapshot(state: &State) -> Vec<Download> {
    state
        .downloads
        .iter()
        .map(|(key, download)| {
            let mut download = download.clone();
            download.transfer = state.transfers.get(key).map(|job| job.progress());
            download
        })
        .collect()
}
pub(super) fn validate_target(target: &str) -> Result<(), AppError> {
    if target.is_empty()
        || target.len() > 255
        || target.starts_with('-')
        || !target
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._-@".contains(&c))
        || target.matches('@').count() > 1
        || target.starts_with('@')
        || target.ends_with('@')
    {
        return Err(AppError::invalid_input(
            "Use an SSH host alias or user@host without options or a path",
        ));
    }
    Ok(())
}
impl Browsers {
    /// Start a background copy. Only files identified by owned download events are eligible.
    pub fn fetch_download(self: &Arc<Self>, profile: &str, id: &str) -> Result<(), AppError> {
        if !cfg!(unix) {
            return Err(AppError::invalid_input(
                "SFTP retrieval currently requires macOS or Linux",
            ));
        }
        let key = format!("{profile}:{id}");
        let job = Arc::new(Transfer::new());
        let (item, target) = {
            let mut state = self
                .state
                .lock()
                .map_err(|_| AppError::internal("Browser state unavailable"))?;
            let config = self
                .profiles()?
                .into_iter()
                .find(|item| item.id == profile && !item.deleting)
                .ok_or_else(|| AppError::not_found("Browser profile unavailable"))?;
            let target = config.remote_transfer_target.as_deref().ok_or_else(|| {
                AppError::invalid_input("Configure the profile's SSH transfer host first")
            })?;
            validate_target(target)?;
            let target = target.to_owned();
            let endpoint = config
                .endpoint
                .as_deref()
                .map(runtime::validate_endpoint)
                .transpose()?;
            if state.closing {
                return Err(AppError::cancelled("Preview is shutting down"));
            }
            if state.transfers.get(&key).is_some_and(|job| job.active()) {
                return Ok(());
            }
            if state.transfers.values().filter(|job| job.active()).count() >= 2 {
                return Err(AppError::invalid_input(
                    "Wait for one of the two active transfers to finish",
                ));
            }
            let item = state
                .downloads
                .get(&key)
                .cloned()
                .ok_or_else(|| AppError::not_found("Download unavailable"))?;
            if item.state != "completed"
                || !item.remote
                || item.local
                || !item.verified
                || item.source_endpoint != endpoint
                || item.remote_path.is_none()
            {
                return Err(AppError::invalid_input(
                    "A verified completed download from the same remote endpoint is required",
                ));
            }
            if !item.received.is_finite()
                || item.received < 0.
                || item.received.fract() != 0.
                || item.received > LIMIT as f64
            {
                return Err(AppError::invalid_input(
                    "Remote transfers support files up to 512 MiB",
                ));
            }
            state.transfers.insert(key.clone(), job.clone());
            (item, target)
        };
        let browsers = self.clone();
        let worker_job = job.clone();
        let worker_key = key.clone();
        let spawn = std::thread::Builder::new()
            .name("preview-download-transfer".into())
            .spawn(move || {
                let result = browsers.retrieve(&worker_key, &item, &target, &worker_job);
                if let Ok(mut value) = worker_job.result.lock() {
                    *value = Some(result);
                }
            });
        if spawn.is_err() {
            if let Ok(mut value) = job.result.lock() {
                *value = Some(Err("failed".into()));
            }
            return Err(AppError::internal("Transfer worker unavailable"));
        }
        Ok(())
    }
    pub fn cancel_transfer(&self, profile: &str, id: &str) -> Result<(), AppError> {
        let state = self
            .state
            .lock()
            .map_err(|_| AppError::internal("Browser state unavailable"))?;
        let job = state
            .transfers
            .get(&format!("{profile}:{id}"))
            .ok_or_else(|| AppError::not_found("Transfer unavailable"))?;
        if job.active() {
            job.cancel();
        }
        Ok(())
    }
    fn retrieve(
        &self,
        key: &str,
        item: &Download,
        target: &str,
        job: &Arc<Transfer>,
    ) -> Result<(), String> {
        self.retrieve_using(key, item, job, |batch| sftp_command(target, batch))
    }
    fn retrieve_using(
        &self,
        key: &str,
        item: &Download,
        job: &Arc<Transfer>,
        command: impl FnOnce(&Path) -> Result<Command, String>,
    ) -> Result<(), String> {
        let directory =
            destination(&self.root, &item.profile).map_err(|_| "destination".to_string())?;
        let staging = tempfile::tempdir_in(&directory).map_err(|_| "destination".to_string())?;
        let payload = tempfile::NamedTempFile::new_in(staging.path())
            .map_err(|_| "destination".to_string())?;
        let mut batch = tempfile::NamedTempFile::new_in(staging.path())
            .map_err(|_| "destination".to_string())?;
        let remote = item.remote_path.as_deref().ok_or("source")?;
        writeln!(
            batch,
            "@get {} {}",
            quoted(remote)?,
            quoted(&payload.path().to_string_lossy())?
        )
        .map_err(|_| "destination".to_string())?;
        batch.flush().map_err(|_| "destination".to_string())?;
        let command = command(batch.path())?;
        let expected = item.received as u64;
        let finished = AtomicBool::new(false);
        let oversized = AtomicBool::new(false);
        let result = std::thread::scope(|scope| {
            scope.spawn(|| {
                while !finished.load(Ordering::Acquire) {
                    if let Ok(metadata) = payload.as_file().metadata() {
                        job.received.store(metadata.len(), Ordering::Relaxed);
                        if metadata.len() > LIMIT || metadata.len() > expected {
                            oversized.store(true, Ordering::Release);
                            job.cancel();
                        }
                    }
                    std::thread::sleep(Duration::from_millis(30));
                }
            });
            let result = cli_process::capture_prepared(command, "sftp", 300, Some(&job.canceled));
            finished.store(true, Ordering::Release);
            result
        });
        if oversized.load(Ordering::Acquire) {
            return Err("size".into());
        }
        if job.canceled.load(Ordering::Acquire) {
            return Err("canceled".into());
        }
        result.map_err(|error| transfer_error(&error).to_owned())?;
        if payload
            .as_file()
            .metadata()
            .map_err(|_| "destination")?
            .len()
            != expected
        {
            return Err("size".into());
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            payload
                .as_file()
                .set_permissions(std::fs::Permissions::from_mode(0o600))
                .map_err(|_| "destination")?;
        }
        payload.as_file().sync_all().map_err(|_| "destination")?;
        // Revalidate the destination and source identity immediately before publication.
        if destination(&self.root, &item.profile).map_err(|_| "destination")? != directory {
            return Err("destination".into());
        }
        let mut state = self.state.lock().map_err(|_| "failed")?;
        if state.closing || job.canceled.load(Ordering::Acquire) {
            return Err("canceled".into());
        }
        if !state
            .transfers
            .get(key)
            .is_some_and(|current| Arc::ptr_eq(current, job))
        {
            return Err("source".into());
        }
        let current = state
            .downloads
            .get_mut(key)
            .filter(|current| {
                current.source_runtime == item.source_runtime
                    && current.remote_path == item.remote_path
                    && !current.local
            })
            .ok_or("source")?;
        let mut name = path_guard::sanitize_name(&item.name);
        while name.len() > 180 {
            name.pop();
        }
        let path = directory.join(format!("{}-{name}", uuid::Uuid::new_v4()));
        payload
            .persist_noclobber(&path)
            .map_err(|_| "destination")?;
        current.local = true;
        current.path = Some(path);
        job.received.store(expected, Ordering::Relaxed);
        Ok(())
    }
}
fn destination(root: &Path, profile: &str) -> Result<PathBuf, AppError> {
    let root = root.canonicalize()?;
    let mut path = root;
    for part in ["downloads", profile, "retrieved"] {
        if part.is_empty()
            || !part
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c))
        {
            return Err(AppError::invalid_input("Invalid download profile"));
        }
        path.push(part);
        match std::fs::create_dir(&path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error.into()),
        }
        let metadata = std::fs::symlink_metadata(&path)?;
        if path_guard::is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
            return Err(AppError::invalid_input("Unsafe download directory"));
        }
    }
    Ok(path)
}
fn quoted(path: &str) -> Result<String, String> {
    if path.is_empty() || path.chars().any(|c| c.is_control()) {
        return Err("source".into());
    }
    Ok(format!(
        "\"{}\"",
        path.replace('\\', "\\\\").replace('"', "\\\"")
    ))
}
fn sftp_command(target: &str, batch: &Path) -> Result<Command, String> {
    let binary = ["/usr/bin/sftp", "/usr/local/bin/sftp"]
        .into_iter()
        .find(|path| Path::new(path).is_file())
        .ok_or("unavailable")?;
    let mut command = Command::new(binary);
    command
        .env("LC_ALL", "C")
        .args(["-q", "-R", "16", "-B", "65536", "-l", "65536", "-b"])
        .arg(batch);
    for option in [
        "BatchMode=yes",
        "StrictHostKeyChecking=yes",
        "ForwardAgent=no",
        "ClearAllForwardings=yes",
        "PermitLocalCommand=no",
        "RemoteCommand=none",
        "ControlMaster=no",
        "ControlPath=none",
        "ConnectTimeout=10",
        "ServerAliveInterval=5",
        "ServerAliveCountMax=2",
    ] {
        command.args(["-o", option]);
    }
    command.arg(target);
    Ok(command)
}
fn transfer_error(error: &str) -> &'static str {
    if error.contains("Host key verification failed")
        || error.contains("REMOTE HOST IDENTIFICATION HAS CHANGED")
    {
        "host_key"
    } else if error.contains("Permission denied") {
        "authentication"
    } else if error.contains("No such file") {
        "source"
    } else if error.contains("timed out") {
        "timeout"
    } else {
        "failed"
    }
}
#[cfg(test)]
mod tests;
