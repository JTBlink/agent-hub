//! Chromium discovery and owned background runtime lifecycle.
use super::{super::error::AppError, cdp::Cdp};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

#[derive(Clone, Serialize, Deserialize)]
pub struct BrowserProfile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub executable: Option<String>,
    #[serde(default)]
    pub endpoint: Option<String>,
    #[serde(default)]
    pub proxy: Option<String>,
    #[serde(default)]
    pub remote_download_directory: Option<String>,
    #[serde(default)]
    pub remote_transfer_target: Option<String>,
    #[serde(default)]
    pub ephemeral: bool,
    #[serde(default)]
    pub deleting: bool,
}
impl BrowserProfile {
    pub fn guest() -> Self {
        Self {
            id: "guest".into(),
            name: "Guest".into(),
            ephemeral: true,
            ..Self::default()
        }
    }
}
impl Default for BrowserProfile {
    fn default() -> Self {
        Self {
            id: "default".into(),
            name: "Default".into(),
            executable: None,
            endpoint: None,
            proxy: None,
            remote_download_directory: None,
            remote_transfer_target: None,
            ephemeral: false,
            deleting: false,
        }
    }
}
pub(super) struct OwnedChild {
    pub process: Child,
    pub _temporary_profile: Option<tempfile::TempDir>,
}
impl Drop for OwnedChild {
    fn drop(&mut self) {
        let _ = self.process.kill();
        let _ = self.process.wait();
    }
}
pub struct Runtime {
    pub(super) execution: super::execution::Execution,
    pub(super) instance_id: String,
    pub(super) download_epoch: u64,
    pub(super) download_frames: std::collections::VecDeque<String>,
    pub(super) remote_download_dir: Option<String>,
    context_proxy: Option<String>,
    pub(super) documents: Option<Arc<super::documents::Documents>>,
    pub(super) ssh_target: Option<String>,
    pub(super) document_forward: Option<super::document_forward::Forward>,
    pub(super) document_forward_gate: Arc<Mutex<()>>,
    child: Option<Arc<Mutex<OwnedChild>>>,
    pub cdp: Cdp,
    pub endpoint: String,
    pub context: Option<String>,
    pub download_dir: Option<PathBuf>,
}
impl Runtime {
    pub(super) fn start(
        root: &Path,
        profile: &BrowserProfile,
        spawn: impl FnOnce(
            &mut Command,
            Option<tempfile::TempDir>,
        ) -> Result<Arc<Mutex<OwnedChild>>, AppError>,
    ) -> Result<Self, AppError> {
        validate_profile(profile)?;
        if profile.deleting {
            return Err(AppError::invalid_input(
                "Profile deletion is pending; retry it in browser settings",
            ));
        }
        let (child, endpoint) = if let Some(endpoint) = &profile.endpoint {
            (None, validate_endpoint(endpoint)?)
        } else {
            let executable = match &profile.executable {
                Some(path) if !path.trim().is_empty() => {
                    let path = PathBuf::from(path);
                    if !path.is_file() {
                        return Err(AppError::not_found(
                            "Configured browser executable is unavailable",
                        ));
                    }
                    path
                }
                _ => discover().ok_or_else(|| AppError::not_found("PREVIEW_BROWSER_NOT_FOUND"))?,
            };
            let temporary = if profile.ephemeral {
                Some(
                    tempfile::Builder::new()
                        .prefix("agent-hub-guest-")
                        .tempdir()?,
                )
            } else {
                None
            };
            let directory = temporary
                .as_ref()
                .map(|directory| directory.path().to_path_buf())
                .unwrap_or_else(|| root.join("profiles").join(&profile.id));
            fs::create_dir_all(&directory)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))?;
            }
            let port_file = directory.join("DevToolsActivePort");
            if port_file.exists() {
                fs::remove_file(&port_file)?;
            }
            let mut command = Command::new(executable);
            command
                .args([
                    "--headless=new",
                    "--remote-debugging-address=127.0.0.1",
                    "--remote-debugging-port=0",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-background-networking",
                ])
                .arg(format!("--user-data-dir={}", directory.display()))
                .arg("about:blank")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            if let Some(proxy) = &profile.proxy {
                command.arg(format!("--proxy-server={proxy}"));
                command.arg("--proxy-bypass-list=<-loopback>;*.agent-hub.localhost");
                command.arg("--dns-prefetch-disable");
            }
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                command.creation_flags(0x08000000);
            }
            #[cfg(test)]
            command.args(["--use-mock-keychain", "--password-store=basic"]);
            let child = spawn(&mut command, temporary)?;
            let started = Instant::now();
            let port = loop {
                if let Some(status) = child
                    .lock()
                    .map_err(|_| AppError::internal("Browser process unavailable"))?
                    .process
                    .try_wait()?
                {
                    return Err(AppError::network(if status.code() == Some(21) {
                        "PREVIEW_PROFILE_IN_USE: Browser profile is already in use. Close the previous AgentHub instance and retry, or use a guest tab. Saved login data has not been removed."
                    } else {
                        "Browser exited during startup; check the executable and profile"
                    }));
                }
                if let Ok(text) = fs::read_to_string(&port_file) {
                    if let Some(port) = text
                        .lines()
                        .next()
                        .and_then(|line| line.parse::<u16>().ok())
                    {
                        break port;
                    }
                }
                if started.elapsed() > Duration::from_secs(15) {
                    let _ = child.lock().map(|mut child| child.process.kill());
                    let _ = child.lock().map(|mut child| child.process.wait());
                    return Err(AppError::network("Browser startup timed out"));
                }
                std::thread::sleep(Duration::from_millis(50));
            };
            (Some(child), format!("http://127.0.0.1:{port}"))
        };
        let cdp = match connect_control(&endpoint) {
            Ok(cdp) => cdp,
            Err(error) => {
                if let Some(child) = child {
                    let _ = child.lock().map(|mut child| child.process.kill());
                    let _ = child.lock().map(|mut child| child.process.wait());
                }
                return Err(error);
            }
        };
        let instance_id = uuid::Uuid::new_v4().to_string();
        let remote_download_dir = profile
            .remote_download_directory
            .as_ref()
            .map(|base| super::remote_downloads::managed_directory(base, &instance_id))
            .transpose()?;
        let mut runtime = Self {
            execution: super::execution::Execution::from_profile(profile),
            instance_id,
            download_epoch: 0,
            download_frames: std::collections::VecDeque::new(),
            remote_download_dir,
            context_proxy: profile.proxy.clone(),
            documents: None,
            ssh_target: profile.remote_transfer_target.clone(),
            document_forward: None,
            document_forward_gate: Arc::new(Mutex::new(())),
            child,
            cdp,
            endpoint,
            context: None,
            download_dir: None,
        };
        if profile.endpoint.is_none() {
            let targets = runtime.cdp.call("Target.getTargets", json!({}))?;
            if let Some(targets) = targets["targetInfos"].as_array() {
                for target in targets {
                    if target["type"] == "page" {
                        let _ = runtime
                            .cdp
                            .call("Target.closeTarget", json!({"targetId":target["targetId"]}));
                    }
                }
            }
        }
        if profile.endpoint.is_some() {
            let context = create_context(&mut runtime.cdp, runtime.context_proxy.as_deref())?;
            runtime.context = Some(
                context["browserContextId"]
                    .as_str()
                    .filter(|id| !id.is_empty())
                    .ok_or_else(|| AppError::network("Browser did not create an isolated context"))?
                    .to_owned(),
            );
            runtime.configure_remote_downloads()?;
        } else {
            let directory = root.join("downloads").join(&profile.id);
            fs::create_dir_all(&directory)?;
            runtime.cdp.call(
                "Browser.setDownloadBehavior",
                json!({ "behavior": "allowAndName", "downloadPath": directory, "eventsEnabled": true }),
            )?;
            runtime.download_dir = Some(directory);
        }
        Ok(runtime)
    }
    pub(super) fn owned_process_exited(&self) -> Result<bool, AppError> {
        match &self.child {
            Some(child) => Ok(child
                .lock()
                .map_err(|_| AppError::internal("Browser process unavailable"))?
                .process
                .try_wait()?
                .is_some()),
            None => Ok(false),
        }
    }
    fn ensure_context(&mut self) -> Result<(), AppError> {
        if let Some(context) = &self.context {
            let contexts = self.cdp.call("Target.getBrowserContexts", json!({}))?;
            let contexts = contexts["browserContextIds"]
                .as_array()
                .ok_or_else(|| AppError::network("Browser contexts unavailable"))?;
            if !contexts
                .iter()
                .any(|value| value.as_str() == Some(context.as_str()))
            {
                let created = create_context(&mut self.cdp, self.context_proxy.as_deref())?;
                self.context = Some(
                    created["browserContextId"]
                        .as_str()
                        .ok_or_else(|| {
                            AppError::network("Browser did not create an isolated context")
                        })?
                        .into(),
                );
                self.download_frames.clear();
            }
        }
        self.configure_remote_downloads()
    }
    pub fn create_page(
        &mut self,
        on_created: impl FnOnce(&str) -> Result<(), AppError>,
    ) -> Result<(String, Cdp), AppError> {
        self.ensure_context()?;
        let mut params = json!({ "url": "about:blank" });
        if let Some(context) = &self.context {
            params["browserContextId"] = json!(context);
        }
        let result = self.cdp.call("Target.createTarget", params)?;
        let id = result["targetId"]
            .as_str()
            .ok_or_else(|| AppError::network("Browser did not create a page"))?
            .to_owned();
        on_created(&id)?;
        let cdp = self.attach_page(&id)?;
        Ok((id, cdp))
    }
    pub fn attach_page(&mut self, id: &str) -> Result<Cdp, AppError> {
        let target = json_endpoint(&self.endpoint, "/json/list")?
            .as_array()
            .and_then(|targets| targets.iter().find(|target| target["id"] == id))
            .cloned()
            .ok_or_else(|| AppError::network("Browser page is not ready"))?;
        let address = target["webSocketDebuggerUrl"]
            .as_str()
            .ok_or_else(|| AppError::network("Browser page is unavailable"))?;
        let address = control_address(&self.endpoint, address)?;
        let mut cdp = Cdp::connect(&address)?;
        if let Some(documents) = self.documents.as_ref().filter(|_| self.context.is_some()) {
            cdp.enable_resources(&address, documents.clone())?;
        }
        cdp.call("Page.enable", json!({}))?;
        cdp.call("Runtime.enable", json!({}))?;
        cdp.call(
            "Page.setInterceptFileChooserDialog",
            json!({"enabled":true}),
        )?;
        cdp.call(
            "Network.enable",
            json!({ "maxTotalBufferSize": 1048576, "maxResourceBufferSize": 65536 }),
        )?;
        cdp.enable_frames(&address)?;
        if self.context.is_some() && self.remote_download_dir.is_some() {
            let tree = cdp.call("Page.getFrameTree", json!({}))?;
            self.remember_download_frames(&tree["frameTree"]);
        }
        Ok(cdp)
    }
}
impl Drop for Runtime {
    fn drop(&mut self) {
        if self.child.is_none() {
            if let Some(context) = &self.context {
                let _ = self.cdp.call(
                    "Target.disposeBrowserContext",
                    json!({ "browserContextId": context }),
                );
            }
        }
    }
}
pub fn json_endpoint(endpoint: &str, path: &str) -> Result<Value, AppError> {
    use std::io::Read;
    let response = reqwest::blocking::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(AppError::network)?
        .get(format!("{endpoint}{path}"))
        .send()
        .map_err(AppError::network)?
        .error_for_status()
        .map_err(AppError::network)?;
    let mut bytes = Vec::new();
    response.take(2 * 1024 * 1024 + 1).read_to_end(&mut bytes)?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err(AppError::network("Browser metadata exceeds limit"));
    }
    serde_json::from_slice(&bytes).map_err(AppError::network)
}
pub fn validate_endpoint(endpoint: &str) -> Result<String, AppError> {
    let url = reqwest::Url::parse(endpoint)
        .map_err(|error| AppError::invalid_input(error.to_string()))?;
    if url.scheme() != "http"
        || !matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "::1"))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err(AppError::invalid_input(
            "Use a loopback HTTP browser endpoint; tunnel remote control through SSH",
        ));
    }
    Ok(url.as_str().trim_end_matches('/').to_owned())
}
pub fn validate_profile(profile: &BrowserProfile) -> Result<(), AppError> {
    if profile.id.is_empty()
        || profile.id.len() > 64
        || !profile
            .id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
        || ["default", "guest"]
            .iter()
            .any(|reserved| profile.id.eq_ignore_ascii_case(reserved) && profile.id != *reserved)
        || profile.name.trim().is_empty()
        || profile.name.len() > 100
        || profile
            .executable
            .as_ref()
            .is_some_and(|path| path.len() > 8192)
    {
        return Err(AppError::invalid_input("Invalid browser profile"));
    }
    if let Some(proxy) = &profile.proxy {
        let url = reqwest::Url::parse(proxy)
            .map_err(|error| AppError::invalid_input(error.to_string()))?;
        if !matches!(url.scheme(), "http" | "https" | "socks5")
            || url.host_str().is_none()
            || proxy.len() > 2048
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err(AppError::invalid_input("Invalid browser proxy"));
        }
    }
    if let Some(endpoint) = &profile.endpoint {
        validate_endpoint(endpoint)?;
    }
    if let Some(directory) = &profile.remote_download_directory {
        if profile.endpoint.is_none() {
            return Err(AppError::invalid_input(
                "Remote download directories require a remote endpoint",
            ));
        }
        super::remote_downloads::managed_directory(directory, "validation")?;
    }
    if let Some(target) = &profile.remote_transfer_target {
        super::remote_ssh::validate_target(target)?;
        if profile.endpoint.is_none() {
            return Err(AppError::invalid_input(
                "Configure the remote endpoint first",
            ));
        }
    }
    Ok(())
}
pub fn discover() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    let candidates = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ]
    .map(PathBuf::from)
    .to_vec();
    #[cfg(windows)]
    let candidates: Vec<PathBuf> = ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"]
        .iter()
        .filter_map(std::env::var_os)
        .flat_map(|root| {
            [
                PathBuf::from(&root).join("Google/Chrome/Application/chrome.exe"),
                PathBuf::from(&root).join("Microsoft/Edge/Application/msedge.exe"),
            ]
        })
        .collect();
    #[cfg(not(any(target_os = "macos", windows)))]
    let candidates: Vec<PathBuf> =
        std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default())
            .flat_map(|directory| {
                [
                    directory.join("google-chrome"),
                    directory.join("chromium"),
                    directory.join("chromium-browser"),
                    directory.join("microsoft-edge"),
                ]
            })
            .collect();
    candidates.into_iter().find(|path| path.is_file())
}

pub(super) fn control_address(endpoint: &str, advertised: &str) -> Result<String, AppError> {
    let endpoint = reqwest::Url::parse(&validate_endpoint(endpoint)?).map_err(AppError::network)?;
    let mut address = reqwest::Url::parse(advertised).map_err(AppError::network)?;
    if address.scheme() != "ws" || !address.username().is_empty() || address.password().is_some() {
        return Err(AppError::invalid_input("Invalid browser WebSocket address"));
    }
    address
        .set_host(endpoint.host_str())
        .map_err(AppError::network)?;
    address
        .set_port(endpoint.port())
        .map_err(|_| AppError::invalid_input("Invalid browser control port"))?;
    Ok(address.into())
}

/// Connect through the validated endpoint, including SSH-forwarded authorities.
pub(super) fn connect_control(endpoint: &str) -> Result<Cdp, AppError> {
    let version = json_endpoint(&validate_endpoint(endpoint)?, "/json/version")?;
    let advertised = version["webSocketDebuggerUrl"]
        .as_str()
        .ok_or_else(|| AppError::network("Browser does not expose CDP"))?;
    let mut cdp = Cdp::connect(&control_address(endpoint, advertised)?)?;
    cdp.set_timeout(Duration::from_secs(2))?;
    Ok(cdp)
}

// Keep initial creation and recovery on the same explicit network policy.
fn create_context(cdp: &mut Cdp, proxy: Option<&str>) -> Result<Value, AppError> {
    let mut params = json!({"disposeOnDetach": false});
    if let Some(proxy) = proxy {
        params["proxyServer"] = json!(proxy);
        // Loopback means the network execution host; it must use an explicit proxy too.
        params["proxyBypassList"] = json!("<-loopback>;*.agent-hub.localhost");
    }
    cdp.call("Target.createBrowserContext", params)
}

#[cfg(test)]
mod tests;
