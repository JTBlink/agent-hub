//! Download events and validated file actions for owned browser profiles.
use super::{
    super::{error::AppError, path_guard},
    browser::Browsers,
};
use serde::Serialize;
use serde_json::json;
use std::{collections::HashMap, path::PathBuf};

#[derive(Clone, Serialize)]
pub struct Download {
    pub id: String,
    pub profile: String,
    pub name: String,
    pub state: String,
    pub received: f64,
    pub total: f64,
    pub local: bool,
    #[serde(skip)]
    pub path: Option<PathBuf>,
}
impl Browsers {
    pub fn downloads(&self) -> Result<Vec<Download>, AppError> {
        // Drain and merge are one transaction across all polling callers.
        // A contending UI poll reads the last committed snapshot instead.
        let Ok(_poll) = self.downloads_gate.try_lock() else {
            return self
                .state
                .lock()
                .map(|state| state.downloads.values().cloned().collect())
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
        for (profile, runtime) in &runtimes {
            let Ok(mut runtime) = runtime.try_lock() else {
                continue;
            };
            if runtime.context.is_some() {
                continue;
            }
            if runtime.cdp.call("Browser.getVersion", json!({})).is_err() {
                continue;
            }
            while let Some(event) = runtime.cdp.events.pop_front() {
                let params = &event["params"];
                let Some(id) = params["guid"].as_str() else {
                    continue;
                };
                let key = format!("{profile}:{id}");
                match event["method"].as_str() {
                    Some("Browser.downloadWillBegin") => {
                        // A paired host is shared; do not surface downloads outside our browser context.
                        if runtime.context.is_some() {
                            continue;
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
                            let mut item = previous.clone();
                            item.state = params["state"].as_str().unwrap_or("inProgress").into();
                            item.received = params["receivedBytes"].as_f64().unwrap_or(0.);
                            item.total = params["totalBytes"].as_f64().unwrap_or(0.);
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
        }
        let mut state = self
            .state
            .lock()
            .map_err(|_| AppError::internal("Browser state unavailable"))?;
        state.downloads.extend(updates);
        if state.downloads.len() > 200 {
            let completed: Vec<_> = state
                .downloads
                .iter()
                .filter(|(_, item)| item.state != "inProgress")
                .map(|(key, _)| key.clone())
                .take(state.downloads.len() - 200)
                .collect();
            for key in completed {
                state.downloads.remove(&key);
            }
        }
        Ok(state.downloads.values().cloned().collect())
    }
    pub fn cancel_download(&self, profile: &str, id: &str) -> Result<(), AppError> {
        let runtime = {
            let state = self
                .state
                .lock()
                .map_err(|_| AppError::internal("Browser state unavailable"))?;
            if !state.downloads.contains_key(&format!("{profile}:{id}")) {
                return Err(AppError::not_found("Download unavailable"));
            }
            state
                .runtimes
                .get(profile)
                .cloned()
                .ok_or_else(|| AppError::not_found("Download runtime unavailable"))?
        };
        let mut runtime = runtime
            .lock()
            .map_err(|_| AppError::internal("Download runtime unavailable"))?;
        runtime
            .cdp
            .call("Browser.cancelDownload", json!({"guid":id}))?;
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
