//! Logical pages and isolated runtime ownership shared by GUI and CLI.
use super::{
    super::error::AppError,
    cdp::Cdp,
    runtime::{self, BrowserProfile, OwnedChild, Runtime},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    process::Command,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

pub struct Page {
    pub cdp: Cdp,
    pub width: u32,
    pub height: u32,
    pub(super) metadata: Arc<Mutex<BrowserPageInfo>>,
}
impl Page {
    pub fn identity(&mut self) -> Result<(String, String), AppError> {
        let result = self.cdp.call("Page.getFrameTree", json!({}))?;
        let frame = &result["frameTree"]["frame"];
        let revision = frame["loaderId"]
            .as_str()
            .filter(|value| !value.is_empty())
            .ok_or_else(|| AppError::network("Browser document is not ready"))?
            .to_owned();
        Ok((
            revision,
            frame["url"].as_str().unwrap_or("about:blank").into(),
        ))
    }
}
#[derive(Clone)]
pub(super) struct PageHandle {
    pub profile: String,
    pub target: String,
    pub internal: bool,
    pub page: Arc<Mutex<Page>>,
    pub metadata: Arc<Mutex<BrowserPageInfo>>,
}
#[derive(Default)]
pub(super) struct State {
    pub downloads: HashMap<String, super::downloads::Download>,
    pub closing: bool,
    pub runtimes: HashMap<String, Arc<Mutex<Runtime>>>,
    pub processes: HashMap<String, Arc<Mutex<OwnedChild>>>,
    pub starting: HashMap<String, Arc<Mutex<()>>>,
    pub pending: HashMap<String, String>,
    pub attaching: HashSet<(String, String)>,
    pub pending_targets: HashMap<String, (String, String)>,
    pub idle: HashMap<String, Instant>,
    pub pages: HashMap<String, PageHandle>,
}
pub struct Browsers {
    pub root: PathBuf,
    pub(super) state: Mutex<State>,
    pub(super) downloads_gate: Mutex<()>,
}
#[derive(Clone, Serialize)]
pub struct BrowserPageInfo {
    pub id: String,
    pub profile: String,
    pub url: String,
    pub title: String,
    pub revision: String,
    pub owner: Option<String>,
}
#[derive(Serialize)]
pub struct BrowserInfo {
    pub executable: Option<String>,
    pub profiles: Vec<BrowserProfile>,
}
#[derive(Serialize)]
pub struct Frame {
    pub image: String,
    pub info: Value,
    pub events: Vec<Value>,
    pub version: u64,
}
struct Reservation<'a> {
    manager: &'a Browsers,
    id: String,
    profile: String,
}
impl Drop for Reservation<'_> {
    fn drop(&mut self) {
        if let Ok(mut state) = self.manager.state.lock() {
            state.pending.remove(&self.id);
            state.pending_targets.remove(&self.id);
            if !state
                .pages
                .values()
                .any(|page| page.profile == self.profile)
                && !state
                    .pending
                    .values()
                    .any(|profile| profile == &self.profile)
            {
                state
                    .idle
                    .entry(self.profile.clone())
                    .or_insert_with(Instant::now);
            }
        }
    }
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Action {
    HandleDialog {
        accept: bool,
        prompt: Option<String>,
    },
    CancelUpload {
        token: String,
    },
    ClickRef {
        reference: String,
    },
    FillRef {
        reference: String,
        value: String,
    },
    Navigate {
        url: String,
    },
    Reload {
        hard: bool,
    },
    Stop,
    Back,
    Forward,
    Resize {
        width: u32,
        height: u32,
        mobile: bool,
    },
    Mouse {
        x: f64,
        y: f64,
        event: String,
        button: Option<String>,
        delta_x: Option<f64>,
        delta_y: Option<f64>,
    },
    Text {
        text: String,
    },
    Key {
        key: String,
        code: String,
        modifiers: u32,
    },
    Evaluate {
        expression: String,
    },
    Pick {
        x: f64,
        y: f64,
    },
    Snapshot,
    Screenshot {
        full: bool,
        clip: Option<Value>,
        #[serde(default)]
        expected_revision: Option<String>,
    },
    Find {
        text: String,
        backwards: bool,
    },
    Cookies,
    ImportCookies {
        cookies: Value,
    },
    Storage,
}
impl Browsers {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            state: Mutex::new(State::default()),
            downloads_gate: Mutex::new(()),
        }
    }
    pub fn shared(root: PathBuf) -> Arc<Self> {
        let manager = Arc::new(Self::new(root));
        let weak = Arc::downgrade(&manager);
        std::thread::spawn(move || loop {
            let Some(manager) = weak.upgrade() else {
                break;
            };
            let closed = manager.state.lock().map_or(true, |state| state.closing);
            if closed {
                break;
            }
            let _ = manager.downloads();
            manager.retire_idle();
            drop(manager);
            std::thread::sleep(Duration::from_millis(700));
        });
        manager
    }
    pub fn info(&self) -> Result<BrowserInfo, AppError> {
        Ok(BrowserInfo {
            executable: runtime::discover().map(|path| path.to_string_lossy().into_owned()),
            profiles: self.profiles()?,
        })
    }
    pub fn profiles(&self) -> Result<Vec<BrowserProfile>, AppError> {
        let path = self.root.join("profiles.json");
        if !path.exists() {
            return Ok(vec![BrowserProfile::default()]);
        }
        let bytes = fs::read(path)?;
        if bytes.len() > 128 * 1024 {
            return Err(AppError::invalid_input(
                "Profile configuration exceeds limit",
            ));
        }
        serde_json::from_slice(&bytes).map_err(AppError::io)
    }
    pub fn save_profile(&self, profile: BrowserProfile) -> Result<(), AppError> {
        runtime::validate_profile(&profile)?;
        let state = self
            .state
            .lock()
            .map_err(|_| AppError::internal("Browser state unavailable"))?;
        if state.runtimes.contains_key(&profile.id)
            || state.pending.values().any(|id| id == &profile.id)
        {
            return Err(AppError::invalid_input(
                "Close the profile's pages and wait for downloads before changing its settings",
            ));
        }
        let mut profiles = self.profiles()?;
        profiles.retain(|existing| existing.id != profile.id);
        if profiles.len() >= 20 {
            return Err(AppError::invalid_input("Profile limit reached"));
        }
        profiles.push(profile);
        fs::create_dir_all(&self.root)?;
        let mut file = tempfile::NamedTempFile::new_in(&self.root)?;
        use std::io::Write;
        file.write_all(&serde_json::to_vec_pretty(&profiles).map_err(AppError::io)?)?;
        file.persist(self.root.join("profiles.json"))
            .map_err(|error| AppError::io(error.error))?;
        Ok(())
    }
    pub fn create(&self, profile: &str, url: &str) -> Result<String, AppError> {
        self.create_page(profile, url, false, None)
    }
    pub(super) fn create_internal(&self, profile: &str, url: &str) -> Result<String, AppError> {
        self.create_page(profile, url, true, None)
    }
    pub fn create_owned(&self, profile: &str, url: &str, owner: &str) -> Result<String, AppError> {
        if owner.len() > 100 {
            return Err(AppError::invalid_input("Invalid preview owner"));
        }
        self.create_page(profile, url, false, Some(owner.into()))
    }
    fn create_page(
        &self,
        profile: &str,
        url: &str,
        internal: bool,
        owner: Option<String>,
    ) -> Result<String, AppError> {
        validate_url(url)?;
        if !self.profiles()?.iter().any(|item| item.id == profile) {
            return Err(AppError::not_found("Browser profile unavailable"));
        }
        let id = uuid::Uuid::new_v4().to_string();
        let gate = {
            let mut state = self
                .state
                .lock()
                .map_err(|_| AppError::internal("Browser state unavailable"))?;
            if state.closing {
                return Err(AppError::cancelled("Preview is shutting down"));
            }
            if state.pages.len() + state.pending.len() + state.attaching.len() >= 12 {
                return Err(AppError::invalid_input("Browser page limit reached"));
            }
            state.pending.insert(id.clone(), profile.into());
            state
                .starting
                .entry(profile.into())
                .or_insert_with(|| Arc::new(Mutex::new(())))
                .clone()
        };
        let _reservation = Reservation {
            manager: self,
            id: id.clone(),
            profile: profile.into(),
        };
        let _gate = gate
            .lock()
            .map_err(|_| AppError::internal("Browser startup unavailable"))?;
        let existing = {
            let state = self
                .state
                .lock()
                .map_err(|_| AppError::internal("Browser state unavailable"))?;
            if state.closing {
                return Err(AppError::cancelled("Preview is shutting down"));
            }
            state.runtimes.get(profile).cloned()
        };
        let runtime = if let Some(runtime) = existing {
            runtime
        } else {
            let settings = self
                .profiles()?
                .into_iter()
                .find(|item| item.id == profile)
                .ok_or_else(|| AppError::not_found("Profile unavailable"))?;
            let created = Runtime::start(&self.root, &settings, |command: &mut Command| {
                let mut state = self
                    .state
                    .lock()
                    .map_err(|_| AppError::internal("Browser state unavailable"))?;
                if state.closing {
                    return Err(AppError::cancelled("Preview is shutting down"));
                }
                let child = Arc::new(Mutex::new(OwnedChild(
                    command.spawn().map_err(AppError::io)?,
                )));
                state.processes.insert(profile.into(), child.clone());
                Ok(child)
            });
            let runtime = match created {
                Ok(runtime) => Arc::new(Mutex::new(runtime)),
                Err(error) => {
                    let child = self
                        .state
                        .lock()
                        .ok()
                        .and_then(|mut state| state.processes.remove(profile));
                    if let Some(child) = child {
                        if let Ok(mut child) = child.lock() {
                            let _ = child.0.kill();
                            let _ = child.0.wait();
                        }
                    }
                    return Err(error);
                }
            };
            {
                let mut state = self
                    .state
                    .lock()
                    .map_err(|_| AppError::internal("Browser state unavailable"))?;
                if state.closing {
                    return Err(AppError::cancelled("Preview is shutting down"));
                }
                state.runtimes.insert(profile.into(), runtime.clone());
            }
            runtime
        };
        let (target, mut cdp) = {
            let mut runtime = runtime
                .lock()
                .map_err(|_| AppError::internal("Browser runtime unavailable"))?;
            let result = runtime.create_page()?;
            self.state
                .lock()
                .map_err(|_| AppError::internal("Browser state unavailable"))?
                .pending_targets
                .insert(id.clone(), (profile.into(), result.0.clone()));
            result
        };
        let setup = (|| {
            cdp.call(
                "Emulation.setDeviceMetricsOverride",
                json!({"width":1200,"height":800,"deviceScaleFactor":1,"mobile":false}),
            )?;
            let result = cdp.call("Page.navigate", json!({"url":url}))?;
            if result.get("errorText").is_some() {
                return Err(AppError::network(
                    result["errorText"].as_str().unwrap_or("Navigation failed"),
                ));
            }
            Ok(())
        })();
        if let Err(error) = setup {
            if let Ok(mut runtime) = runtime.lock() {
                let _ = runtime
                    .cdp
                    .call("Target.closeTarget", json!({"targetId":target}));
            }
            return Err(error);
        }
        let metadata = Arc::new(Mutex::new(BrowserPageInfo {
            id: id.clone(),
            profile: profile.into(),
            url: url.into(),
            title: url.into(),
            revision: String::new(),
            owner,
        }));
        let page = Arc::new(Mutex::new(Page {
            cdp,
            width: 1200,
            height: 800,
            metadata: metadata.clone(),
        }));
        let mut state = self
            .state
            .lock()
            .map_err(|_| AppError::internal("Browser state unavailable"))?;
        if state.closing {
            return Err(AppError::cancelled("Preview is shutting down"));
        }
        state.pages.insert(
            id.clone(),
            PageHandle {
                profile: profile.into(),
                target,
                internal,
                page,
                metadata,
            },
        );
        state.idle.remove(profile);
        Ok(id)
    }
    pub fn page(&self, id: &str) -> Result<Arc<Mutex<Page>>, AppError> {
        self.state
            .lock()
            .map_err(|_| AppError::internal("Browser state unavailable"))?
            .pages
            .get(id)
            .map(|handle| handle.page.clone())
            .ok_or_else(|| AppError::not_found("Browser page closed"))
    }
    pub fn close(&self, id: &str) -> Result<(), AppError> {
        let (page, runtime) = {
            let state = self
                .state
                .lock()
                .map_err(|_| AppError::internal("Browser state unavailable"))?;
            let Some(page) = state.pages.get(id).cloned() else {
                return Ok(());
            };
            let runtime = state.runtimes.get(&page.profile).cloned().ok_or_else(|| {
                AppError::network("Cannot verify page closure: runtime unavailable")
            })?;
            (page, runtime)
        };
        let result = runtime
            .lock()
            .map_err(|_| AppError::internal("Browser runtime unavailable"))?
            .cdp
            .call("Target.closeTarget", json!({"targetId":page.target}))?;
        if result["success"] != true {
            return Err(AppError::network("Browser did not confirm page closure"));
        }
        let mut state = self
            .state
            .lock()
            .map_err(|_| AppError::internal("Browser state unavailable"))?;
        state.pages.remove(id);
        if !state
            .pages
            .values()
            .any(|item| item.profile == page.profile)
        {
            state.idle.insert(page.profile.clone(), Instant::now());
        }
        Ok(())
    }
    pub fn list(&self) -> Result<Vec<BrowserPageInfo>, AppError> {
        let runtimes = self.runtime_handles()?;
        let mut verified = HashSet::new();
        let mut found = HashMap::new();
        for (profile, runtime) in &runtimes {
            let Ok(mut runtime) = runtime.try_lock() else {
                continue;
            };
            let Ok(result) = runtime.cdp.call("Target.getTargets", json!({})) else {
                continue;
            };
            verified.insert(profile.clone());
            if let Some(targets) = result["targetInfos"].as_array() {
                for target in targets {
                    if target["type"] != "page"
                        || runtime.context.as_ref().is_some_and(|context| {
                            target["browserContextId"].as_str() != Some(context.as_str())
                        })
                    {
                        continue;
                    }
                    if let Some(id) = target["targetId"].as_str() {
                        found.insert((profile.clone(), id.to_owned()), target.clone());
                    }
                }
            }
        }
        let to_attach = {
            let mut state = self
                .state
                .lock()
                .map_err(|_| AppError::internal("Browser state unavailable"))?;
            state.pages.retain(|_, page| {
                !verified.contains(&page.profile)
                    || found.contains_key(&(page.profile.clone(), page.target.clone()))
            });
            let mut pending = Vec::new();
            for key in found.keys() {
                if state
                    .pages
                    .values()
                    .any(|page| (&page.profile, &page.target) == (&key.0, &key.1))
                    || state.attaching.contains(key)
                    || state.pending_targets.values().any(|target| target == key)
                {
                    continue;
                }
                if state.pages.len() + state.pending.len() + state.attaching.len() >= 12 {
                    continue;
                }
                state.attaching.insert(key.clone());
                pending.push(key.clone());
            }
            pending
        };
        for (profile, target) in to_attach {
            let cdp = runtimes
                .get(&profile)
                .and_then(|runtime| runtime.try_lock().ok())
                .and_then(|runtime| runtime.attach_page(&target).ok());
            let mut state = self
                .state
                .lock()
                .map_err(|_| AppError::internal("Browser state unavailable"))?;
            state.attaching.remove(&(profile.clone(), target.clone()));
            if state.closing {
                continue;
            }
            if let Some(cdp) = cdp {
                if state
                    .pages
                    .values()
                    .any(|page| page.profile == profile && page.target == target)
                {
                    continue;
                }
                let id = uuid::Uuid::new_v4().to_string();
                let info = &found[&(profile.clone(), target.clone())];
                let metadata = Arc::new(Mutex::new(BrowserPageInfo {
                    id: id.clone(),
                    profile: profile.clone(),
                    url: info["url"].as_str().unwrap_or("about:blank").into(),
                    title: info["title"]
                        .as_str()
                        .unwrap_or("")
                        .chars()
                        .take(500)
                        .collect(),
                    revision: String::new(),
                    owner: None,
                }));
                let page = Arc::new(Mutex::new(Page {
                    cdp,
                    width: 1200,
                    height: 800,
                    metadata: metadata.clone(),
                }));
                state.pages.insert(
                    id,
                    PageHandle {
                        profile: profile.clone(),
                        target,
                        internal: false,
                        page,
                        metadata,
                    },
                );
                state.idle.remove(&profile);
            }
        }
        let handles = self
            .state
            .lock()
            .map_err(|_| AppError::internal("Browser state unavailable"))?
            .pages
            .values()
            .cloned()
            .collect::<Vec<_>>();
        let mut pages = Vec::new();
        for handle in handles {
            if handle.internal {
                continue;
            }
            let mut metadata = handle
                .metadata
                .lock()
                .map_err(|_| AppError::internal("Browser metadata unavailable"))?;
            if let Some(target) = found.get(&(handle.profile, handle.target)) {
                metadata.url = target["url"].as_str().unwrap_or(&metadata.url).to_owned();
                metadata.title = target["title"]
                    .as_str()
                    .unwrap_or(&metadata.title)
                    .chars()
                    .take(500)
                    .collect();
            }
            pages.push(metadata.clone());
        }
        Ok(pages)
    }
    pub(super) fn runtime_handles(&self) -> Result<HashMap<String, Arc<Mutex<Runtime>>>, AppError> {
        Ok(self
            .state
            .lock()
            .map_err(|_| AppError::internal("Browser state unavailable"))?
            .runtimes
            .clone())
    }
    fn retire_idle(&self) {
        let retired = {
            let Ok(mut state) = self.state.lock() else {
                return;
            };
            let profiles = state
                .idle
                .iter()
                .filter(|(profile, time)| {
                    time.elapsed() > Duration::from_secs(3)
                        && !state.pending.values().any(|id| id == *profile)
                        && !state
                            .downloads
                            .values()
                            .any(|item| &item.profile == *profile && item.state == "inProgress")
                })
                .map(|(profile, _)| profile.clone())
                .collect::<Vec<_>>();
            let mut retired = Vec::new();
            for profile in profiles {
                if state.pages.values().any(|page| page.profile == profile) {
                    state.idle.remove(&profile);
                    continue;
                }
                retired.push((
                    state.runtimes.remove(&profile),
                    state.processes.remove(&profile),
                ));
                state.idle.remove(&profile);
                state.starting.remove(&profile);
            }
            retired
        };
        for (runtime, process) in retired {
            if let Some(process) = process {
                if let Ok(mut process) = process.lock() {
                    let _ = process.0.kill();
                    let _ = process.0.wait();
                }
            }
            drop(runtime);
        }
    }
    pub fn clear(&self) {
        let detached = {
            let Ok(mut state) = self.state.lock() else {
                return;
            };
            state.closing = true;
            state.pages.clear();
            (
                std::mem::take(&mut state.runtimes),
                std::mem::take(&mut state.processes),
            )
        };
        for child in detached.1.values() {
            if let Ok(mut child) = child.lock() {
                let _ = child.0.kill();
                let _ = child.0.wait();
            }
        }
        drop(detached);
    }
}
pub fn validate_url(value: &str) -> Result<(), AppError> {
    let url =
        reqwest::Url::parse(value).map_err(|error| AppError::invalid_input(error.to_string()))?;
    if value.len() > 8192
        || !matches!(url.scheme(), "http" | "https" | "about")
        || (url.scheme() == "about" && value != "about:blank")
    {
        return Err(AppError::invalid_input(
            "Only HTTP, HTTPS and about:blank addresses are supported",
        ));
    }
    Ok(())
}
#[cfg(test)]
#[path = "browser/tests.rs"]
mod tests;
