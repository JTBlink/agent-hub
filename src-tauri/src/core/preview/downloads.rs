//! Download events and validated file actions for owned browser profiles.
use super::{
    super::{error::AppError, path_guard},
    browser::Browsers,
};
use serde::Serialize;
use serde_json::json;
use std::{collections::HashMap, path::PathBuf};

#[derive(Clone, Serialize, Default)]
pub struct Download {
    pub id: String,
    pub profile: String,
    pub name: String,
    pub state: String,
    pub received: f64,
    pub total: f64,
    pub local: bool,
    pub remote: bool,
    pub transfer: Option<super::download_transfer::Progress>,
    #[serde(skip)]
    pub source_endpoint: Option<String>,
    #[serde(skip)]
    pub source_runtime: String,
    #[serde(skip)]
    pub source_epoch: u64,
    #[serde(skip)]
    pub source_context: Option<String>,
    #[serde(skip)]
    pub remote_path: Option<String>,
    pub verified: bool,
    #[serde(skip)]
    pub path: Option<PathBuf>,
}
impl Download {
    fn observe_progress(&mut self, params: &serde_json::Value) {
        let Some(state @ ("inProgress" | "completed" | "canceled")) = params["state"].as_str()
        else {
            self.verified = false;
            return;
        };
        self.verified = true;
        self.state = state.into();
        if let Some(value) = params["receivedBytes"]
            .as_f64()
            .filter(|value| value.is_finite() && *value >= 0.)
        {
            self.received = value;
        }
        if let Some(value) = params["totalBytes"]
            .as_f64()
            .filter(|value| value.is_finite() && *value >= 0.)
        {
            self.total = value;
        }
    }
}
impl Browsers {
    pub fn downloads(&self) -> Result<Vec<Download>, AppError> {
        // Drain and merge are one transaction across all polling callers.
        // A contending UI poll reads the last committed snapshot instead.
        let Ok(_poll) = self.downloads_gate.try_lock() else {
            return self
                .state
                .lock()
                .map(|state| super::download_transfer::snapshot(&state))
                .map_err(|_| AppError::internal("Browser state unavailable"));
        };
        let previous_downloads = self
            .state
            .lock()
            .map_err(|_| AppError::internal("Browser state unavailable"))?
            .downloads
            .clone();
        let runtimes = self.runtime_handles()?;
        let mut updates = HashMap::new();
        let mut unverified_source = false;
        for (profile, runtime) in &runtimes {
            let Ok(mut runtime) = runtime.try_lock() else {
                continue;
            };
            if runtime.context.is_some() && runtime.remote_download_dir.is_none() {
                continue;
            }
            let verified = runtime.cdp.call("Browser.getVersion", json!({})).is_ok();
            for (key, item) in &previous_downloads {
                if &item.profile == profile
                    && item.state == "inProgress"
                    && (!verified
                        || item.source_context != runtime.context
                        || item.source_epoch != runtime.download_epoch)
                {
                    let mut item = item.clone();
                    item.verified = false;
                    if item.remote && item.source_context != runtime.context {
                        item.state = "interrupted".into();
                    }
                    updates.insert(key.clone(), item);
                }
            }
            if !verified {
                continue;
            }
            let mut ownership_verified = true;
            let events: Vec<_> = runtime.cdp.events.drain(..).collect();
            for (index, event) in events.iter().enumerate() {
                let params = &event["params"];
                let Some(id) = params["guid"].as_str() else {
                    continue;
                };
                let key = format!("{profile}:{id}");
                match event["method"].as_str() {
                    Some("Browser.downloadWillBegin") => {
                        if uuid::Uuid::parse_str(id).is_err() {
                            continue;
                        }
                        match runtime
                            .owns_download_frame(params["frameId"].as_str().unwrap_or_default())
                        {
                            Ok(true) => {}
                            Ok(false) => continue,
                            Err(_) => {
                                ownership_verified = false;
                                let pending = events[index..]
                                    .iter()
                                    .cloned()
                                    .chain(runtime.cdp.events.drain(..))
                                    .take(256)
                                    .collect();
                                runtime.cdp.events = pending;
                                break;
                            }
                        }
                        let name = params["suggestedFilename"]
                            .as_str()
                            .unwrap_or("download")
                            .chars()
                            .take(200)
                            .collect();
                        updates.insert(
                            key,
                            Download {
                                id: id.into(),
                                profile: profile.clone(),
                                name,
                                state: "inProgress".into(),
                                received: 0.,
                                total: 0.,
                                local: runtime.download_dir.is_some(),
                                remote: runtime.context.is_some(),
                                transfer: None,
                                source_endpoint: runtime
                                    .context
                                    .as_ref()
                                    .map(|_| runtime.endpoint.clone()),
                                source_runtime: runtime.instance_id.clone(),
                                source_epoch: runtime.download_epoch,
                                source_context: runtime.context.clone(),
                                remote_path: runtime
                                    .remote_download_dir
                                    .as_ref()
                                    .map(|directory| format!("{directory}/{id}")),
                                verified: true,
                                path: runtime
                                    .download_dir
                                    .as_ref()
                                    .map(|directory| directory.join(id)),
                            },
                        );
                    }
                    Some("Browser.downloadProgress") => {
                        let previous = updates.get(&key).or_else(|| previous_downloads.get(&key));
                        if let Some(previous) = previous {
                            if previous.source_runtime != runtime.instance_id {
                                continue;
                            }
                            let mut item = previous.clone();
                            item.observe_progress(params);
                            if item.verified {
                                item.source_epoch = runtime.download_epoch;
                            }
                            if item.state == "completed" {
                                if let Some(path) = &item.path {
                                    if path.file_name().is_some_and(|name| name == id)
                                        && path.is_file()
                                    {
                                        let mut name = path_guard::sanitize_name(&item.name);
                                        while name.len() > 180 {
                                            name.pop();
                                        }
                                        let target = path.with_file_name(format!("{id}-{name}"));
                                        if std::fs::rename(path, &target).is_ok() {
                                            item.path = Some(target);
                                        }
                                    }
                                }
                            }
                            updates.insert(key, item);
                        }
                    }
                    _ => {}
                }
            }
            if !ownership_verified {
                unverified_source = true;
                let affected = previous_downloads
                    .iter()
                    .chain(updates.iter())
                    .filter(|(_, item)| &item.profile == profile && item.state == "inProgress")
                    .map(|(key, item)| (key.clone(), item.clone()))
                    .collect::<Vec<_>>();
                for (key, mut item) in affected {
                    item.verified = false;
                    updates.insert(key, item);
                }
            }
        }
        let mut state = self
            .state
            .lock()
            .map_err(|_| AppError::internal("Browser state unavailable"))?;
        for (key, mut update) in updates {
            if let Some(current) = state.downloads.get(&key) {
                if current.source_runtime == update.source_runtime
                    && current.remote
                    && current.local
                {
                    update.local = true;
                    update.path.clone_from(&current.path);
                }
            }
            state.downloads.insert(key, update);
        }
        if state.downloads.len() > 200 {
            let completed: Vec<_> = state
                .downloads
                .iter()
                .filter(|(key, item)| {
                    item.state != "inProgress"
                        && !state.transfers.get(*key).is_some_and(|job| job.active())
                })
                .map(|(key, _)| key.clone())
                .take(state.downloads.len() - 200)
                .collect();
            for key in completed {
                state.downloads.remove(&key);
                state.transfers.remove(&key);
            }
        }
        if unverified_source {
            return Err(AppError::network("PREVIEW_DOWNLOAD_UNVERIFIED"));
        }
        Ok(super::download_transfer::snapshot(&state))
    }
    pub fn cancel_download(&self, profile: &str, id: &str) -> Result<(), AppError> {
        let _poll = self
            .downloads_gate
            .lock()
            .map_err(|_| AppError::internal("Download state unavailable"))?;
        let (item, runtime) = {
            let state = self
                .state
                .lock()
                .map_err(|_| AppError::internal("Browser state unavailable"))?;
            let item = state
                .downloads
                .get(&format!("{profile}:{id}"))
                .cloned()
                .ok_or_else(|| AppError::not_found("Download unavailable"))?;
            if item.state != "inProgress" {
                return Err(AppError::invalid_input("Download is no longer active"));
            }
            let runtime = state
                .runtimes
                .get(profile)
                .cloned()
                .ok_or_else(|| AppError::not_found("Download runtime unavailable"))?;
            (item, runtime)
        };
        let mut runtime = runtime
            .lock()
            .map_err(|_| AppError::internal("Download runtime unavailable"))?;
        if item.source_runtime != runtime.instance_id || item.source_context != runtime.context {
            return Err(AppError::cancelled(
                "Download source session is no longer available",
            ));
        }
        let mut params = json!({"guid":id});
        if let Some(context) = item.source_context {
            params["browserContextId"] = json!(context);
        }
        runtime.cdp.call("Browser.cancelDownload", params)?;
        Ok(())
    }
    /// Remove only a terminal history record; keep the downloaded file untouched.
    pub fn forget_download(&self, profile: &str, id: &str) -> Result<(), AppError> {
        let _poll = self
            .downloads_gate
            .lock()
            .map_err(|_| AppError::internal("Download history unavailable"))?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| AppError::internal("Browser state unavailable"))?;
        let key = format!("{profile}:{id}");
        let item = state
            .downloads
            .get(&key)
            .ok_or_else(|| AppError::not_found("Download unavailable"))?;
        if !matches!(
            item.state.as_str(),
            "completed" | "canceled" | "interrupted"
        ) {
            return Err(AppError::invalid_input(
                "Cancel the download before removing its record",
            ));
        }
        if state.transfers.get(&key).is_some_and(|job| job.active()) {
            return Err(AppError::invalid_input(
                "Cancel the transfer before removing its record",
            ));
        }
        state.downloads.remove(&key);
        state.transfers.remove(&key);
        Ok(())
    }
    pub fn download_path(&self, profile: &str, id: &str) -> Result<PathBuf, AppError> {
        let state = self
            .state
            .lock()
            .map_err(|_| AppError::internal("Browser state unavailable"))?;
        let item = state
            .downloads
            .get(&format!("{profile}:{id}"))
            .ok_or_else(|| AppError::not_found("Download unavailable"))?;
        if item.state != "completed" || !item.local {
            return Err(AppError::invalid_input(
                "Download is not a completed local file",
            ));
        }
        let path = item
            .path
            .as_ref()
            .ok_or_else(|| AppError::not_found("Downloaded file unavailable"))?
            .canonicalize()?;
        let root = self.root.join("downloads").canonicalize()?;
        if !path.starts_with(root) || !path.is_file() {
            return Err(AppError::invalid_input(
                "Downloaded file is outside the managed directory",
            ));
        }
        Ok(path)
    }
}

#[cfg(test)]
#[path = "downloads/tests.rs"]
mod tests;
