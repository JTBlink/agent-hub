//! Observe owned targets without discarding recovery identities for lost processes/contexts.
use super::{
    super::error::AppError,
    browser::{BrowserPageInfo, Browsers, Page, PageHandle, PageStatus},
    runtime::Runtime,
};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    sync::{Arc, Mutex},
};
struct Observation {
    runtimes: HashMap<String, Arc<Mutex<Runtime>>>,
    observed: HashMap<String, PageHandle>,
    downloads: HashSet<String>,
    lost_profiles: HashSet<String>,
    verified: HashSet<String>,
    found: HashMap<(String, String), Value>,
}
impl Browsers {
    pub fn list(&self) -> Result<Vec<BrowserPageInfo>, AppError> {
        self.apply_inventory(self.observe_inventory()?)
    }
    fn observe_inventory(&self) -> Result<Observation, AppError> {
        let runtimes = self.runtime_handles()?;
        let (observed, downloads) = {
            let state = self
                .state
                .lock()
                .map_err(|_| AppError::internal("Browser state unavailable"))?;
            (
                state.pages.clone(),
                state.downloads.keys().cloned().collect::<HashSet<_>>(),
            )
        };
        let mut lost_profiles = HashSet::new();
        let mut verified = HashSet::new();
        let mut found = HashMap::new();
        for (profile, runtime) in &runtimes {
            let Ok(mut runtime) = runtime.try_lock() else {
                continue;
            };
            if runtime.owned_process_exited()? {
                lost_profiles.insert(profile.clone());
                continue;
            }
            let Ok(result) = runtime.cdp.call("Target.getTargets", json!({})) else {
                continue;
            };
            let Some(targets) = result["targetInfos"].as_array() else {
                continue;
            };
            if let Some(context) = &runtime.context.clone() {
                if !targets
                    .iter()
                    .any(|target| target["browserContextId"].as_str() == Some(context.as_str()))
                {
                    let Ok(contexts) = runtime.cdp.call("Target.getBrowserContexts", json!({}))
                    else {
                        continue;
                    };
                    let Some(contexts) = contexts["browserContextIds"].as_array() else {
                        continue;
                    };
                    if !contexts
                        .iter()
                        .any(|item| item.as_str() == Some(context.as_str()))
                    {
                        lost_profiles.insert(profile.clone());
                    }
                }
            }
            verified.insert(profile.clone());
            {
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
        Ok(Observation {
            runtimes,
            observed,
            downloads,
            lost_profiles,
            verified,
            found,
        })
    }
    fn apply_inventory(&self, observation: Observation) -> Result<Vec<BrowserPageInfo>, AppError> {
        let Observation {
            runtimes,
            observed,
            downloads,
            lost_profiles,
            verified,
            found,
        } = observation;
        self.retain_discovered_loss(&lost_profiles, &runtimes, &observed, &downloads)?;
        let to_attach = {
            let mut state = self
                .state
                .lock()
                .map_err(|_| AppError::internal("Browser state unavailable"))?;
            let retained = state.lost_pages.clone();
            let reopening = state.reopening_profiles.clone();
            state.pages.retain(|id, page| {
                let unchanged = observed.get(id).is_some_and(|old| {
                    Arc::ptr_eq(&old.page, &page.page) && old.target == page.target
                });
                !unchanged
                    || retained.contains(id)
                    || reopening.get(&page.profile) == Some(id)
                    || !verified.contains(&page.profile)
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
                .and_then(|mut runtime| runtime.attach_page(&target).ok());
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
                    status: PageStatus::Connected,
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
                    connection_generation: 0,
                    snapshots: VecDeque::new(),
                    cdp,
                    width: 1200,
                    height: 800,
                    mobile: false,
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
        let lost = self
            .state
            .lock()
            .map_err(|_| AppError::internal("Browser state unavailable"))?
            .lost_pages
            .clone();
        let mut pages = Vec::new();
        for handle in handles {
            if handle.internal {
                continue;
            }
            let mut metadata = handle
                .metadata
                .lock()
                .map_err(|_| AppError::internal("Browser metadata unavailable"))?;
            let unchanged = observed.get(&metadata.id).is_some_and(|old| {
                Arc::ptr_eq(&old.page, &handle.page) && old.target == handle.target
            });
            if unchanged {
                if let Some(target) = found.get(&(handle.profile.clone(), handle.target.clone())) {
                    if let Some(url) = target["url"]
                        .as_str()
                        .filter(|url| super::browser::validate_url(url).is_ok())
                    {
                        metadata.url = url.to_owned();
                    }
                    metadata.title = target["title"]
                        .as_str()
                        .unwrap_or(&metadata.title)
                        .chars()
                        .take(500)
                        .collect();
                }
                if !found.contains_key(&(handle.profile.clone(), handle.target.clone()))
                    && metadata.status != PageStatus::Gone
                {
                    metadata.status = PageStatus::Unverified;
                }
            }
            if lost.contains(&metadata.id) {
                metadata.status = PageStatus::Gone;
            }
            pages.push(metadata.clone());
        }
        Ok(pages)
    }
    fn retain_discovered_loss(
        &self,
        profiles: &HashSet<String>,
        runtimes: &HashMap<String, Arc<Mutex<Runtime>>>,
        observed: &HashMap<String, PageHandle>,
        downloads: &HashSet<String>,
    ) -> Result<(), AppError> {
        if profiles.is_empty() {
            return Ok(());
        }
        let _downloads = self
            .downloads_gate
            .lock()
            .map_err(|_| AppError::internal("Download state unavailable"))?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| AppError::internal("Browser state unavailable"))?;
        let current: HashSet<_> = profiles
            .iter()
            .filter(|profile| {
                state
                    .runtimes
                    .get(*profile)
                    .zip(runtimes.get(*profile))
                    .is_some_and(|(current, old)| Arc::ptr_eq(current, old))
            })
            .cloned()
            .collect();
        let lost = observed
            .iter()
            .filter(|(id, old)| {
                current.contains(&old.profile)
                    && state.pages.get(*id).is_some_and(|page| {
                        Arc::ptr_eq(&page.page, &old.page) && page.target == old.target
                    })
            })
            .map(|(id, _)| id.clone())
            .collect::<Vec<_>>();
        state.mark_pages_lost(lost);
        let interrupted = downloads
            .iter()
            .filter(|key| {
                state
                    .downloads
                    .get(*key)
                    .is_some_and(|item| current.contains(&item.profile))
            })
            .cloned()
            .collect::<Vec<_>>();
        state.interrupt_downloads(interrupted);
        Ok(())
    }
}

#[cfg(test)]
#[path = "inventory/tests.rs"]
mod tests;
