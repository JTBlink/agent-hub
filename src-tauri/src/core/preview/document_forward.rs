//! Reverse only the explicitly registered document server through an authenticated SSH master.
use super::browser::Browsers;
#[cfg(unix)]
use crate::core::cli_process;
use crate::core::error::AppError;
use std::{
    path::Path,
    process::Child,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

#[cfg(unix)]
use std::{
    process::{Command, Stdio},
    time::{Duration, Instant},
};

pub(super) struct Forward {
    pub local_port: u16,
    pub remote_port: u16,
    child: Child,
    #[cfg(unix)]
    _group: cli_process::CancelGroup,
    _directory: tempfile::TempDir,
}
impl Forward {
    #[cfg(unix)]
    fn start(
        target: &str,
        local_port: u16,
        config: Option<&Path>,
        cancel: &AtomicBool,
    ) -> Result<Self, AppError> {
        use std::os::unix::process::CommandExt;
        if cancel.load(Ordering::Acquire) {
            return Err(AppError::cancelled("Document forwarding cancelled"));
        }
        super::remote_ssh::validate_target(target)?;
        if local_port == 0 {
            return Err(AppError::invalid_input("Document server unavailable"));
        }
        let binary = ["/usr/bin/ssh", "/usr/local/bin/ssh"]
            .into_iter()
            .find(|value| Path::new(value).is_file())
            .ok_or_else(|| {
                AppError::not_found("OpenSSH is required for remote document forwarding")
            })?;
        let directory = tempfile::Builder::new()
            .prefix("ah-doc-")
            .tempdir_in("/tmp")?;
        let control = directory.path().join("mux");
        let mut command = Command::new(binary);
        super::remote_ssh::secure_options(&mut command);
        if let Some(config) = config {
            command.arg("-F").arg(config);
        }
        command
            .args([
                "-M",
                "-N",
                "-T",
                "-oControlPersist=no",
                "-oForkAfterAuthentication=no",
                "-S",
            ])
            .arg(&control)
            .arg(target)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .process_group(0);
        let child = command
            .spawn()
            .map_err(|_| AppError::io("SSH document connection could not start"))?;
        let group = cli_process::CancelGroup(Some(child.id()));
        let mut forward = Self {
            local_port,
            remote_port: 0,
            child,
            _group: group,
            _directory: directory,
        };
        let deadline = Instant::now() + Duration::from_secs(12);
        while !control.exists() {
            if cancel.load(Ordering::Acquire) {
                return Err(AppError::cancelled("Document forwarding cancelled"));
            }
            if !forward.healthy() || Instant::now() >= deadline {
                return Err(AppError::network("SSH document connection unavailable; verify the host key, key authentication and forwarding permission"));
            }
            std::thread::sleep(Duration::from_millis(30));
        }
        // The control command reads no user config, so it cannot replay unrelated configured forwards.
        let mut command = Command::new(binary);
        command
            .args(["-F", "/dev/null", "-S"])
            .arg(&control)
            .args(["-O", "forward", "-R"])
            .arg(format!("127.0.0.1:0:127.0.0.1:{local_port}"))
            .arg(target);
        let (port, _) =
            cli_process::capture_prepared(command, "ssh", 8, Some(cancel)).map_err(|_| {
                AppError::network(
                    "SSH document forwarding failed; check server forwarding permissions",
                )
            })?;
        forward.remote_port = port
            .trim()
            .parse::<u16>()
            .ok()
            .filter(|port| *port != 0)
            .ok_or_else(|| AppError::network("SSH did not return a document forwarding port"))?;
        Ok(forward)
    }
    #[cfg(not(unix))]
    fn start(
        _target: &str,
        _local_port: u16,
        _config: Option<&Path>,
        _cancel: &AtomicBool,
    ) -> Result<Self, AppError> {
        Err(AppError::invalid_input(
            "SSH document forwarding currently requires macOS or Linux",
        ))
    }
    fn healthy(&mut self) -> bool {
        self.child.try_wait().is_ok_and(|status| status.is_none())
    }
}
impl Drop for Forward {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
impl Browsers {
    pub(super) fn register_document_origin(&self, origin: &str) -> Result<(), AppError> {
        let url = reqwest::Url::parse(origin)
            .map_err(|error| AppError::invalid_input(error.to_string()))?;
        if url.scheme() != "http"
            || url.host_str() != Some("127.0.0.1")
            || !url.username().is_empty()
            || url.password().is_some()
            || url.path() != "/"
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err(AppError::invalid_input("Invalid owned document server"));
        }
        let port = url
            .port()
            .ok_or_else(|| AppError::invalid_input("Document server port unavailable"))?;
        self.document_port.store(port, Ordering::Release);
        Ok(())
    }
    pub(super) fn resolve_document_url(
        &self,
        profile: &str,
        address: &str,
    ) -> Result<String, AppError> {
        self.resolve_document_url_using(profile, address, |target, port, cancel| {
            Forward::start(target, port, None, cancel)
        })
    }
    // Keep the gate, cancellation lease and unpublished Forward in one transaction so
    // every early return releases the same ownership without cross-function cleanup.
    fn resolve_document_url_using(
        &self,
        profile: &str,
        address: &str,
        start: impl FnOnce(&str, u16, &AtomicBool) -> Result<Forward, AppError>,
    ) -> Result<String, AppError> {
        super::browser::validate_url(address)?;
        let port = self.document_port.load(Ordering::Acquire);
        if port == 0 {
            return Ok(address.into());
        }
        let Ok(mut url) = reqwest::Url::parse(address) else {
            return Ok(address.into());
        };
        let Some(id) = url
            .host_str()
            .and_then(|host| host.strip_suffix(".agent-hub.localhost"))
        else {
            return Ok(address.into());
        };
        if url.scheme() != "http"
            || !url.username().is_empty()
            || url.password().is_some()
            || uuid::Uuid::parse_str(id).is_err()
        {
            return Ok(address.into());
        }
        let id = id.to_owned();
        let decoded = urlencoding::decode(url.path().trim_start_matches('/'))
            .map_err(|error| AppError::invalid_input(error.to_string()))?
            .into_owned();
        self.documents.resource(&id, &decoded)?;
        // Capability identity is the grant, not a previous renderer's forwarding port.
        // Always target the registered owned server when a tab changes execution profile.
        url.set_port(Some(port))
            .map_err(|_| AppError::invalid_input("Invalid document port"))?;
        let canonical = url.to_string();
        let Some(runtime) = self.runtime_handles()?.get(profile).cloned() else {
            return Ok(canonical);
        };
        let gate = runtime
            .lock()
            .map_err(|_| AppError::internal("Browser runtime unavailable"))?
            .document_forward_gate
            .clone();
        let _gate = gate
            .lock()
            .map_err(|_| AppError::internal("Document forward initialization unavailable"))?;
        let target = {
            let mut current = runtime
                .lock()
                .map_err(|_| AppError::internal("Browser runtime unavailable"))?;
            if current.context.is_none() || current.ssh_target.is_none() {
                return Ok(canonical);
            }
            if let Some(forward) = &mut current.document_forward {
                if forward.local_port != port {
                    return Err(AppError::invalid_input(
                        "Document address is not served by this preview",
                    ));
                }
                if !forward.healthy() {
                    return Err(AppError::network(
                        "SSH document connection lost; close the profile's pages and reopen them",
                    ));
                }
                url.set_port(Some(forward.remote_port))
                    .map_err(|_| AppError::invalid_input("Invalid document port"))?;
                return Ok(url.into());
            }
            current
                .ssh_target
                .clone()
                .ok_or_else(|| AppError::invalid_input("Configure an SSH transfer host"))?
        };
        let cancel = Arc::new(AtomicBool::new(false));
        {
            let mut state = self
                .state
                .lock()
                .map_err(|_| AppError::internal("Browser state unavailable"))?;
            if state.closing
                || !state
                    .runtimes
                    .get(profile)
                    .is_some_and(|value| Arc::ptr_eq(value, &runtime))
            {
                return Err(AppError::cancelled("Document runtime changed"));
            }
            if state.document_builds.contains_key(profile) {
                return Err(AppError::cancelled("Document forwarding already starting"));
            }
            state.document_builds.insert(profile.into(), cancel.clone());
        }
        let _lease = BuildLease {
            owner: self,
            profile: profile.into(),
            cancel: cancel.clone(),
        };
        // No state or Runtime lock is held across authentication and forwarding setup.
        let forward = start(&target, port, &cancel)?;
        self.documents.resource(&id, &decoded)?;
        let remote = forward.remote_port;
        {
            let mut current = runtime
                .lock()
                .map_err(|_| AppError::internal("Browser runtime unavailable"))?;
            let state = self
                .state
                .lock()
                .map_err(|_| AppError::internal("Browser state unavailable"))?;
            if state.closing
                || cancel.load(Ordering::Acquire)
                || !state
                    .runtimes
                    .get(profile)
                    .is_some_and(|value| Arc::ptr_eq(value, &runtime))
            {
                return Err(AppError::cancelled("Document runtime changed"));
            }
            current.document_forward = Some(forward);
        }
        url.set_port(Some(remote))
            .map_err(|_| AppError::invalid_input("Invalid document port"))?;
        Ok(url.into())
    }
}
struct BuildLease<'a> {
    owner: &'a Browsers,
    profile: String,
    cancel: Arc<AtomicBool>,
}
impl Drop for BuildLease<'_> {
    fn drop(&mut self) {
        if let Ok(mut state) = self.owner.state.lock() {
            if state
                .document_builds
                .get(&self.profile)
                .is_some_and(|cancel| Arc::ptr_eq(cancel, &self.cancel))
            {
                state.document_builds.remove(&self.profile);
            }
        }
    }
}
#[cfg(test)]
mod tests;
