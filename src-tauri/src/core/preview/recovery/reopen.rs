//! Explicit replacement of a failed page, with profile-scoped lifecycle ownership.
use super::super::{
    browser::{Browsers, PageHandle, PageStatus, ProfileLease},
    runtime::{self, Runtime},
};
use crate::core::error::AppError;
use serde_json::json;
use std::sync::{Arc, Mutex};

struct Attempt<'a> {
    handle: PageHandle,
    runtime: Option<Arc<Mutex<Runtime>>>,
    _reservation: ProfileLease<'a>,
}
enum Loss {
    Page,
    Context,
    Process,
}
impl Browsers {
    /// Explicitly load the last known address in a new target while retaining the logical page ID.
    pub fn reopen(&self, id: &str) -> Result<(), AppError> {
        let attempt = self.reserve_reopen(id)?;
        let handle = &attempt.handle;
        let runtime = attempt.runtime.as_ref();
        let address = handle
            .metadata
            .lock()
            .map_err(|_| AppError::internal("Browser metadata unavailable"))?
            .url
            .clone();
        super::super::browser::validate_url(&address)?;
        let loss = match runtime {
            Some(runtime) => prepare(handle, runtime)?,
            None => Loss::Process,
        };
        self.record_loss(handle, runtime, loss)?;
        let replacement = self.create_replacement(&handle.profile, &address, id)?;
        let result = self.install_replacement(id, &replacement, handle);
        if result.is_err() && self.close(&replacement).is_err() {
            // Keep the confirmed replacement under its original logical ID when cleanup is unknown.
            self.adopt_replacement(id, &replacement, handle, PageStatus::Unverified)?;
            return Err(AppError::network("PREVIEW_REOPEN_UNCERTAIN"));
        }
        result
    }
    fn reserve_reopen(&self, id: &str) -> Result<Attempt<'_>, AppError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| AppError::internal("Browser state unavailable"))?;
        if state.closing {
            return Err(AppError::cancelled("Preview is shutting down"));
        }
        let handle = state
            .pages
            .get(id)
            .cloned()
            .ok_or_else(|| AppError::not_found("PREVIEW_PAGE_GONE"))?;
        if state.reopening_profiles.contains_key(&handle.profile)
            || state
                .pending
                .values()
                .any(|profile| profile == &handle.profile)
            || state
                .attaching
                .iter()
                .any(|(profile, _)| profile == &handle.profile)
        {
            return Err(AppError::cancelled("PREVIEW_REOPEN_BUSY"));
        }
        let runtime = state.runtimes.get(&handle.profile).cloned();
        if runtime.is_none() && !state.lost_pages.contains(id) {
            return Err(AppError::not_found("PREVIEW_PAGE_GONE"));
        }
        state
            .reopening_profiles
            .insert(handle.profile.clone(), id.into());
        let reservation = ProfileLease {
            browsers: self,
            profile: handle.profile.clone(),
            id: id.into(),
        };
        Ok(Attempt {
            handle,
            runtime,
            _reservation: reservation,
        })
    }
    fn record_loss(
        &self,
        handle: &PageHandle,
        runtime: Option<&Arc<Mutex<Runtime>>>,
        loss: Loss,
    ) -> Result<(), AppError> {
        // Download polling owns this gate before taking state; preserve that order while retiring its old runtime snapshot.
        let _downloads = self
            .downloads_gate
            .lock()
            .map_err(|_| AppError::internal("Download state unavailable"))?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| AppError::internal("Browser state unavailable"))?;
        let same = match (state.runtimes.get(&handle.profile), runtime) {
            (Some(current), Some(expected)) => Arc::ptr_eq(current, expected),
            (None, None) => true,
            _ => false,
        };
        if state.closing || !same {
            return Err(AppError::cancelled("PREVIEW_REOPEN_BUSY"));
        }
        let all = !matches!(loss, Loss::Page);
        let lost = state
            .pages
            .iter()
            .filter(|(_, page)| {
                page.profile == handle.profile && (all || Arc::ptr_eq(&page.page, &handle.page))
            })
            .map(|(id, _)| id.clone())
            .collect::<Vec<_>>();
        state.mark_pages_lost(lost);
        if all {
            let keys = state
                .downloads
                .iter()
                .filter(|(_, item)| item.profile == handle.profile)
                .map(|(key, _)| key.clone())
                .collect::<Vec<_>>();
            state.interrupt_downloads(keys);
        }
        let retired = if matches!(loss, Loss::Process) {
            (
                state.runtimes.remove(&handle.profile),
                state.processes.remove(&handle.profile),
            )
        } else {
            (None, None)
        };
        drop(state);
        drop(retired);
        Ok(())
    }
    fn install_replacement(
        &self,
        id: &str,
        replacement: &str,
        original: &PageHandle,
    ) -> Result<(), AppError> {
        let old = original
            .page
            .lock()
            .map_err(|_| AppError::internal("Browser page unavailable"))?;
        let page = self.page(replacement)?;
        let mut page = page
            .lock()
            .map_err(|_| AppError::internal("Browser replacement unavailable"))?;
        page.cdp.expected_size = Some((old.width, old.height));
        page.width = old.width;
        page.height = old.height;
        page.mobile = old.mobile;
        page.connection_generation = old.connection_generation.wrapping_add(1);
        page.cdp.frame_version = old.cdp.frame_version.saturating_add(1);
        page.cdp.frame = None;
        page.cdp.call("Emulation.setDeviceMetricsOverride",json!({"width":old.width,"height":old.height,"deviceScaleFactor":1,"mobile":old.mobile}))?;
        drop(page);
        drop(old);
        self.adopt_replacement(id, replacement, original, PageStatus::Connected)
    }
    fn adopt_replacement(
        &self,
        id: &str,
        replacement: &str,
        original: &PageHandle,
        status: PageStatus,
    ) -> Result<(), AppError> {
        let owner = original
            .metadata
            .lock()
            .map_err(|_| AppError::internal("Browser metadata unavailable"))?
            .owner
            .clone();
        let mut state = self
            .state
            .lock()
            .map_err(|_| AppError::internal("Browser state unavailable"))?;
        if state.closing
            || !state
                .pages
                .get(id)
                .is_some_and(|current| Arc::ptr_eq(&current.page, &original.page))
        {
            return Err(AppError::cancelled("PREVIEW_PAGE_GONE"));
        }
        let mut next = state
            .pages
            .remove(replacement)
            .ok_or_else(|| AppError::not_found("PREVIEW_PAGE_GONE"))?;
        next.internal = original.internal;
        {
            let mut metadata = next
                .metadata
                .lock()
                .map_err(|_| AppError::internal("Browser metadata unavailable"))?;
            metadata.id = id.into();
            metadata.owner = owner;
            metadata.status = status;
        }
        state.pages.insert(id.into(), next);
        state.lost_pages.remove(id);
        Ok(())
    }
}
fn prepare(handle: &PageHandle, runtime: &Arc<Mutex<Runtime>>) -> Result<Loss, AppError> {
    let mut runtime = runtime
        .lock()
        .map_err(|_| AppError::internal("Browser runtime unavailable"))?;
    if runtime.owned_process_exited()? {
        return Ok(Loss::Process);
    }
    let mut control = runtime::connect_control(&runtime.endpoint)?;
    let targets = control.call("Target.getTargets", json!({}))?;
    let targets = targets["targetInfos"]
        .as_array()
        .ok_or_else(|| AppError::network("Browser targets unavailable"))?;
    let context_lost = if let Some(context) = &runtime.context {
        let value = control.call("Target.getBrowserContexts", json!({}))?;
        let contexts = value["browserContextIds"]
            .as_array()
            .ok_or_else(|| AppError::network("Browser contexts unavailable"))?;
        !contexts
            .iter()
            .any(|value| value.as_str() == Some(context.as_str()))
    } else {
        false
    };
    if let Some(target) = targets
        .iter()
        .find(|target| target["targetId"] == handle.target)
    {
        if target["type"] != "page"
            || runtime.context.as_ref().is_some_and(|context| {
                target["browserContextId"].as_str() != Some(context.as_str())
            })
        {
            return Err(AppError::not_found("PREVIEW_PAGE_GONE"));
        }
        let closed = control.call("Target.closeTarget", json!({"targetId":handle.target}))?;
        if closed["success"] != true {
            return Err(AppError::network("Browser did not confirm page closure"));
        }
    }
    runtime.cdp = control;
    Ok(if context_lost {
        Loss::Context
    } else {
        Loss::Page
    })
}

#[cfg(test)]
#[path = "reopen/tests.rs"]
mod tests;
