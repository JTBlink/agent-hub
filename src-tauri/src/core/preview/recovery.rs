//! Explicit transport recovery for an existing logical page; never replay navigation or input.
mod reopen;
use super::{super::error::AppError, browser::Browsers, runtime};
use serde_json::json;
use std::sync::Arc;

impl Browsers {
    /// Reattach the original owned target without navigating or replaying input.
    pub fn reconnect(&self, id: &str) -> Result<(), AppError> {
        let (handle, runtime) = {
            let state = self
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
            if state.reopening_profiles.contains_key(&handle.profile) {
                return Err(AppError::cancelled("PREVIEW_REOPEN_BUSY"));
            }
            let runtime = state
                .runtimes
                .get(&handle.profile)
                .cloned()
                .ok_or_else(|| AppError::not_found("PREVIEW_PAGE_GONE"))?;
            (handle, runtime)
        };
        let mut transport = {
            let mut runtime = runtime
                .lock()
                .map_err(|_| AppError::internal("Browser runtime unavailable"))?;
            let mut control = runtime::connect_control(&runtime.endpoint)?;
            let result = control.call("Target.getTargets", json!({}))?;
            let target = result["targetInfos"].as_array().and_then(|targets| {
                targets
                    .iter()
                    .find(|target| target["targetId"] == handle.target && target["type"] == "page")
            });
            if !target.is_some_and(|target| {
                runtime.context.as_ref().map_or(true, |context| {
                    target["browserContextId"].as_str() == Some(context.as_str())
                })
            }) {
                return Err(AppError::not_found("PREVIEW_PAGE_GONE"));
            }
            let transport = runtime.attach_page(&handle.target)?;
            if let Some(directory) = &runtime.download_dir {
                control.call("Browser.setDownloadBehavior", json!({"behavior":"allowAndName","downloadPath":directory,"eventsEnabled":true}))?;
            }
            if let Some(params) = runtime.remote_download_behavior() {
                control.call("Browser.setDownloadBehavior", params)?;
            }
            runtime.download_epoch = runtime.download_epoch.wrapping_add(1);
            // Swap only after target ownership and page attachment have both succeeded.
            runtime.cdp = control;
            transport
        };
        let mut page = handle
            .page
            .lock()
            .map_err(|_| AppError::internal("Browser page unavailable"))?;
        {
            let state = self
                .state
                .lock()
                .map_err(|_| AppError::internal("Browser state unavailable"))?;
            if state.closing
                || !state
                    .pages
                    .get(id)
                    .is_some_and(|current| Arc::ptr_eq(&current.page, &handle.page))
            {
                return Err(AppError::cancelled("PREVIEW_PAGE_GONE"));
            }
        }
        transport.expected_size = Some((page.width, page.height));
        transport.call("Emulation.setDeviceMetricsOverride", json!({"width":page.width,"height":page.height,"deviceScaleFactor":1,"mobile":page.mobile}))?;
        // CLI recovery must also invalidate an existing GUI frame cursor.
        transport.frame_version = page.cdp.frame_version.saturating_add(1);
        transport.frame = None;
        page.cdp = transport;
        page.connection_generation = page.connection_generation.wrapping_add(1);
        page.snapshots.clear();
        Ok(())
    }
}
#[cfg(test)]
#[path = "recovery/tests.rs"]
mod tests;
