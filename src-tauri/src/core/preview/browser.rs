//! Logical pages and isolated runtime ownership shared by GUI and CLI.
use super::{
    super::error::AppError,
    cdp::Cdp,
    runtime::{self, BrowserProfile, OwnedChild, Runtime},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    path::PathBuf,
    process::Command,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

pub struct Page {
    pub(super) connection_generation: u64,
    pub(super) snapshots: VecDeque<(String, String)>,
    pub cdp: Cdp,
    pub width: u32,
    pub height: u32,
    pub(super) mobile: bool,
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
        let url = match frame["unreachableUrl"]
            .as_str()
            .filter(|url| validate_url(url).is_ok())
        {
            Some(url) => url.to_owned(),
            None => format!(
                "{}{}",
                frame["url"].as_str().unwrap_or("about:blank"),
                frame["urlFragment"].as_str().unwrap_or("")
            ),
        };
        let revision = format!(
            "{}:{}:{}:{:x}",
            revision,
            self.connection_generation,
            self.cdp.navigation_version,
            Sha256::digest(url.as_bytes())
        );
        self.snapshots.retain(|(_, value)| value == &revision);
        Ok((revision, url))
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
    pub reopening_profiles: HashMap<String, String>,
    pub lost_pages: HashSet<String>,
    pub cookie_gates: HashMap<String, Arc<Mutex<()>>>,
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
#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PageStatus {
    Connected,
    Unverified,
    Gone,
}
#[derive(Clone, Serialize)]
pub struct BrowserPageInfo {
    pub status: PageStatus,
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
pub(super) struct ProfileLease<'a> {
    pub browsers: &'a Browsers,
    pub profile: String,
    pub id: String,
}
impl Drop for ProfileLease<'_> {
    fn drop(&mut self) {
        if let Ok(mut state) = self.browsers.state.lock() {
            if state.reopening_profiles.get(&self.profile) == Some(&self.id) {
                state.reopening_profiles.remove(&self.profile);
            }
        }
    }
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
    VerifyRevision {
        expected_revision: String,
    },
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
    pub fn create(&self, profile: &str, url: &str) -> Result<String, AppError> {
        self.create_page(profile, url, false, None, None)
    }
    pub(super) fn create_internal(&self, profile: &str, url: &str) -> Result<String, AppError> {
        self.create_page(profile, url, true, None, None)
    }
    pub fn create_owned(&self, profile: &str, url: &str, owner: &str) -> Result<String, AppError> {
        if owner.len() > 100 {
            return Err(AppError::invalid_input("Invalid preview owner"));
        }
        self.create_page(profile, url, false, Some(owner.into()), None)
    }
    pub(super) fn create_replacement(
        &self,
        profile: &str,
        url: &str,
        original: &str,
    ) -> Result<String, AppError> {
        self.create_page(profile, url, true, None, Some(original))
    }
    fn create_page(
        &self,
        profile: &str,
        url: &str,
        internal: bool,
        owner: Option<String>,
        recovery_id: Option<&str>,
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
            if state.reopening_profiles.get(profile).map(String::as_str) != recovery_id {
                return Err(AppError::cancelled("PREVIEW_REOPEN_BUSY"));
            }
            let limit = if recovery_id.is_some() { 13 } else { 12 };
            if state.pages.len() + state.pending.len() + state.attaching.len() >= limit {
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
            let created =
                Runtime::start(&self.root, &settings, |command: &mut Command, temporary| {
                    let mut state = self
                        .state
                        .lock()
                        .map_err(|_| AppError::internal("Browser state unavailable"))?;
                    if state.closing {
                        return Err(AppError::cancelled("Preview is shutting down"));
                    }
                    let child = Arc::new(Mutex::new(OwnedChild {
                        process: command.spawn().map_err(AppError::io)?,
                        _temporary_profile: temporary,
                    }));
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
                            let _ = child.process.kill();
                            let _ = child.process.wait();
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
            let result = runtime.create_page(|target| {
                self.state
                    .lock()
                    .map_err(|_| AppError::internal("Browser state unavailable"))?
                    .pending_targets
                    .insert(id.clone(), (profile.into(), target.into()));
                Ok(())
            });
            match result {
                Ok(result) => result,
                Err(error) => {
                    let target = self
                        .state
                        .lock()
                        .map_err(|_| AppError::internal("Browser state unavailable"))?
                        .pending_targets
                        .get(&id)
                        .map(|(_, target)| target.clone());
                    if let Some(target) = target {
                        let closed = runtime
                            .cdp
                            .call("Target.closeTarget", json!({"targetId":target}))
                            .is_ok_and(|value| value["success"] == true);
                        if !closed {
                            if let Some(original) = recovery_id {
                                self.keep_uncertain_replacement(original, profile, &target)?;
                                return Err(AppError::network("PREVIEW_REOPEN_UNCERTAIN"));
                            }
                        }
                    }
                    return Err(error);
                }
            }
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
            let closed = runtime.lock().ok().is_some_and(|mut runtime| {
                runtime
                    .cdp
                    .call("Target.closeTarget", json!({"targetId":target}))
                    .is_ok_and(|value| value["success"] == true)
            });
            if !closed {
                if let Some(original) = recovery_id {
                    self.keep_uncertain_replacement(original, profile, &target)?;
                    return Err(AppError::network("PREVIEW_REOPEN_UNCERTAIN"));
                }
            }
            return Err(error);
        }
        let metadata = Arc::new(Mutex::new(BrowserPageInfo {
            status: PageStatus::Connected,
            id: id.clone(),
            profile: profile.into(),
            url: url.into(),
            title: url.into(),
            revision: String::new(),
            owner,
        }));
        let page = Arc::new(Mutex::new(Page {
            connection_generation: 0,
            snapshots: VecDeque::new(),
            cdp,
            width: 1200,
            height: 800,
            mobile: false,
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
    fn keep_uncertain_replacement(
        &self,
        original: &str,
        profile: &str,
        target: &str,
    ) -> Result<(), AppError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| AppError::internal("Browser state unavailable"))?;
        if state.closing
            || state.reopening_profiles.get(profile).map(String::as_str) != Some(original)
        {
            return Err(AppError::cancelled("PREVIEW_PAGE_GONE"));
        }
        let page = state
            .pages
            .get_mut(original)
            .filter(|page| page.profile == profile)
            .ok_or_else(|| AppError::not_found("PREVIEW_PAGE_GONE"))?;
        page.target = target.into();
        page.metadata
            .lock()
            .map_err(|_| AppError::internal("Browser metadata unavailable"))?
            .status = PageStatus::Unverified;
        state.lost_pages.remove(original);
        Ok(())
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
        let _lease = {
            let mut state = self
                .state
                .lock()
                .map_err(|_| AppError::internal("Browser state unavailable"))?;
            if let Some(page) = state.pages.get(id) {
                if state.reopening_profiles.contains_key(&page.profile) && !page.internal {
                    return Err(AppError::cancelled("PREVIEW_REOPEN_BUSY"));
                }
            }
            if state.lost_pages.remove(id) {
                if let Some(page) = state.pages.remove(id) {
                    if !state
                        .pages
                        .values()
                        .any(|item| item.profile == page.profile)
                    {
                        state.idle.insert(page.profile, Instant::now());
                    }
                }
                return Ok(());
            }
            if let Some(page) = state.pages.get(id).cloned() {
                if page.internal && state.reopening_profiles.contains_key(&page.profile) {
                    None
                } else {
                    state
                        .reopening_profiles
                        .insert(page.profile.clone(), id.into());
                    Some(ProfileLease {
                        browsers: self,
                        profile: page.profile,
                        id: id.into(),
                    })
                }
            } else {
                return Ok(());
            }
        };
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
        if state
            .pages
            .get(id)
            .is_some_and(|current| !Arc::ptr_eq(&current.page, &page.page))
        {
            return Err(AppError::cancelled("PREVIEW_REOPEN_BUSY"));
        }
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
                    let _ = process.process.kill();
                    let _ = process.process.wait();
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
                let _ = child.process.kill();
                let _ = child.process.wait();
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
