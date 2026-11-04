//! Login import staging: the renderer receives scopes and counts, never browser cookie values.
mod apply;
pub use apply::ImportResult;
pub mod policy;
pub mod sources;
use super::{super::error::AppError, browser::Browsers};
use policy::{Cookie, Skipped};
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashMap},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
#[derive(Clone, Serialize)]
pub struct Target {
    pub id: String,
    pub profile: String,
    pub profile_name: String,
    pub revision: String,
    pub title: String,
    pub url: String,
}
#[derive(Serialize)]
pub struct Summary {
    pub id: String,
    pub target: Target,
    pub domains: BTreeMap<String, usize>,
    pub total: usize,
    pub importable: usize,
    pub skipped: Skipped,
}
struct Batch {
    target: Target,
    cookies: Vec<Cookie>,
    created: Instant,
}
#[derive(Default)]
pub struct Imports {
    batches: Mutex<HashMap<String, Batch>>,
}
impl Imports {
    pub fn shared() -> Arc<Self> {
        let imports = Arc::new(Self::default());
        let weak = Arc::downgrade(&imports);
        std::thread::spawn(move || {
            while let Some(imports) = weak.upgrade() {
                if let Ok(mut batches) = imports.batches.lock() {
                    batches.retain(|_, batch| batch.created.elapsed() < Duration::from_secs(300));
                }
                drop(imports);
                std::thread::sleep(Duration::from_secs(1));
            }
        });
        imports
    }
    pub fn prepare(
        &self,
        browsers: &Browsers,
        id: &str,
        revision: &str,
        value: Value,
    ) -> Result<Summary, AppError> {
        let target = target(browsers, id, revision)?;
        self.prepare_target(target, value)
    }
    /// Stage renderer-independent cookie scopes without exposing their values.
    pub fn prepare_target(&self, target: Target, value: Value) -> Result<Summary, AppError> {
        let normalized = policy::normalize(value)?;
        let mut domains = BTreeMap::new();
        for cookie in &normalized.cookies {
            *domains.entry(cookie.domain.clone()).or_default() += 1;
        }
        let summary = Summary {
            id: uuid::Uuid::new_v4().to_string(),
            target: target.clone(),
            domains,
            total: normalized.total,
            importable: normalized.cookies.len(),
            skipped: normalized.skipped,
        };
        let mut batches = self
            .batches
            .lock()
            .map_err(|_| AppError::internal("Cookie imports unavailable"))?;
        batches.retain(|_, batch| batch.created.elapsed() < Duration::from_secs(300));
        if batches.len() >= 4 {
            return Err(AppError::invalid_input(
                "Close an existing cookie import preview before opening another",
            ));
        }
        batches.insert(
            summary.id.clone(),
            Batch {
                target,
                cookies: normalized.cookies,
                created: Instant::now(),
            },
        );
        Ok(summary)
    }
    pub fn cancel(&self, id: &str) {
        if let Ok(mut batches) = self.batches.lock() {
            batches.remove(id);
        }
    }
    pub fn clear(&self) {
        if let Ok(mut batches) = self.batches.lock() {
            batches.clear();
        }
    }
    pub fn apply(
        &self,
        browsers: &Browsers,
        id: &str,
        domains: Vec<String>,
        replace: bool,
    ) -> Result<ImportResult, AppError> {
        let (target, cookies) = self.take(id, domains)?;
        browsers.apply_cookies(&target, cookies, replace)
    }
    /// Consume one bounded, expiring preview for a renderer-specific mutation adapter.
    pub fn take(&self, id: &str, domains: Vec<String>) -> Result<(Target, Vec<Cookie>), AppError> {
        let batch = self
            .batches
            .lock()
            .map_err(|_| AppError::internal("Cookie imports unavailable"))?
            .remove(id)
            .ok_or_else(|| {
                AppError::cancelled("Cookie import preview expired; inspect the source again")
            })?;
        if batch.created.elapsed() >= Duration::from_secs(300) {
            return Err(AppError::cancelled(
                "Cookie import preview expired; inspect the source again",
            ));
        }
        let allowed = batch
            .cookies
            .iter()
            .map(|cookie| cookie.domain.clone())
            .collect::<std::collections::HashSet<_>>();
        if domains.is_empty() || domains.iter().any(|domain| !allowed.contains(domain)) {
            return Err(AppError::invalid_input(
                "Select domains from this import preview",
            ));
        }
        let cookies = batch
            .cookies
            .into_iter()
            .filter(|cookie| domains.contains(&cookie.domain))
            .collect::<Vec<_>>();
        Ok((batch.target, cookies))
    }
}
pub(super) fn target(browsers: &Browsers, id: &str, revision: &str) -> Result<Target, AppError> {
    let page = browsers.page(id)?;
    let mut page = page
        .lock()
        .map_err(|_| AppError::internal("Browser page unavailable"))?;
    let (current, url) = page.identity()?;
    if current != revision {
        return Err(AppError::cancelled(
            "Page changed; inspect the cookie source again",
        ));
    }
    let metadata = page
        .metadata
        .lock()
        .map_err(|_| AppError::internal("Browser metadata unavailable"))?;
    Ok(Target {
        id: id.into(),
        profile: metadata.profile.clone(),
        profile_name: browsers
            .profiles()?
            .iter()
            .find(|profile| profile.id == metadata.profile)
            .map(|profile| profile.name.clone())
            .unwrap_or_else(|| metadata.profile.clone()),
        title: metadata.title.clone(),
        url,
        revision: current,
    })
}

#[cfg(test)]
#[path = "tests/policy.rs"]
mod policy_tests;

#[cfg(test)]
#[path = "tests/browser.rs"]
mod browser_tests;
