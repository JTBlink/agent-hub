//! Native download callbacks provide start/completion, but no reliable progress or cancel handle.
use crate::core::error::AppError;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
#[derive(Clone)]
struct Entry {
    id: String,
    view: String,
    url: String,
    name: String,
    path: PathBuf,
    state: &'static str,
    bytes: u64,
}
#[derive(Clone)]
pub struct Downloads {
    items: Arc<Mutex<Vec<Entry>>>,
    root: Arc<PathBuf>,
}
impl Default for Downloads {
    fn default() -> Self {
        Self::at(crate::core::central_repo::home_base_dir().join("preview-native/downloads"))
    }
}
impl Downloads {
    /// Supply an isolated download directory for native runtime verification.
    pub fn at(root: PathBuf) -> Self {
        Self {
            items: Arc::default(),
            root: Arc::new(root),
        }
    }
    pub(crate) fn requested(
        &self,
        view: &str,
        url: &str,
        suggested: &Path,
    ) -> Result<PathBuf, AppError> {
        let mut items = self
            .items
            .lock()
            .map_err(|_| AppError::internal("Native downloads unavailable"))?;
        if items
            .iter()
            .filter(|item| item.state == "inProgress")
            .count()
            >= 12
            || items
                .iter()
                .any(|item| item.view == view && item.url == url && item.state == "inProgress")
        {
            return Err(AppError::invalid_input("Native download already active"));
        }
        let id = uuid::Uuid::new_v4().to_string();
        let name = suggested
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty() && name.len() <= 200)
            .unwrap_or("download.bin")
            .to_owned();
        let root = self.root.join(&id);
        std::fs::create_dir_all(&root)?;
        let path = root.join(&name);
        if items.len() >= 256 {
            if let Some(index) = items.iter().position(|item| item.state != "inProgress") {
                items.remove(index);
            } else {
                return Err(AppError::invalid_input("Native download history is full"));
            }
        }
        items.push(Entry {
            id,
            view: view.into(),
            url: url.into(),
            name,
            path: path.clone(),
            state: "inProgress",
            bytes: 0,
        });
        Ok(path)
    }
    pub(crate) fn finished(&self, view: &str, url: &str, success: bool) {
        if let Ok(mut items) = self.items.lock() {
            if let Some(item) = items
                .iter_mut()
                .find(|item| item.view == view && item.url == url && item.state == "inProgress")
            {
                let file = std::fs::symlink_metadata(&item.path)
                    .ok()
                    .filter(|metadata| metadata.is_file());
                item.state = if success && file.is_some() {
                    "completed"
                } else {
                    "interrupted"
                };
                item.bytes = file.map(|metadata| metadata.len()).unwrap_or(0);
            }
        }
    }
    pub(crate) fn close_view(&self, view: &str) {
        if let Ok(mut items) = self.items.lock() {
            for item in items
                .iter_mut()
                .filter(|item| item.view == view && item.state == "inProgress")
            {
                item.state = "interrupted";
            }
        }
    }
    /// Read the owned native download history without exposing URLs or filesystem paths.
    pub fn snapshot(&self) -> Result<Vec<Value>, AppError> {
        let items = self
            .items
            .lock()
            .map_err(|_| AppError::internal("Native downloads unavailable"))?;
        Ok(items.iter().map(|item|json!({"id":item.id,"profile":"native","name":item.name,"state":item.state,"received":item.bytes,"total":item.bytes,"local":item.state=="completed"&&item.path.is_file(),"remote":false,"verified":item.state!="interrupted","cancel_supported":false})).collect())
    }
    pub(crate) fn forget(&self, id: &str) -> Result<(), AppError> {
        let mut items = self
            .items
            .lock()
            .map_err(|_| AppError::internal("Native downloads unavailable"))?;
        let index = items
            .iter()
            .position(|item| item.id == id)
            .ok_or_else(|| AppError::not_found("Native download unavailable"))?;
        if items[index].state == "inProgress" {
            return Err(AppError::invalid_input("Native download is still active"));
        }
        items.remove(index);
        Ok(())
    }
    pub(crate) fn path(&self, id: &str) -> Result<PathBuf, AppError> {
        let items = self
            .items
            .lock()
            .map_err(|_| AppError::internal("Native downloads unavailable"))?;
        let item = items
            .iter()
            .find(|item| item.id == id && item.state == "completed")
            .ok_or_else(|| AppError::not_found("Native download unavailable"))?;
        let path = item.path.canonicalize()?;
        let root = self.root.canonicalize()?;
        if !path.starts_with(root) || !path.is_file() {
            return Err(AppError::invalid_input(
                "Native download is outside the managed directory",
            ));
        }
        Ok(path)
    }
}

#[cfg(test)]
mod tests {
    use super::Downloads;
    use std::path::Path;
    #[test]
    fn tracks_download_completion_without_removing_files_and_blocks_duplicate_active_requests() {
        let directory = tempfile::tempdir().unwrap();
        let downloads = Downloads::at(directory.path().to_path_buf());
        let path = downloads
            .requested(
                "view",
                "https://example.invalid/file",
                Path::new("report.txt"),
            )
            .unwrap();
        assert!(downloads
            .requested(
                "view",
                "https://example.invalid/file",
                Path::new("report.txt")
            )
            .is_err());
        let id = downloads.snapshot().unwrap()[0]["id"]
            .as_str()
            .unwrap()
            .to_owned();
        assert!(downloads.forget(&id).is_err());
        std::fs::write(&path, b"native fixture").unwrap();
        downloads.finished("view", "https://example.invalid/file", true);
        let item = &downloads.snapshot().unwrap()[0];
        assert_eq!(item["state"], "completed");
        assert_eq!(item["local"], true);
        assert_eq!(item["cancel_supported"], false);
        assert_eq!(downloads.path(&id).unwrap(), path.canonicalize().unwrap());
        downloads.forget(&id).unwrap();
        assert!(path.is_file());
        assert!(downloads.snapshot().unwrap().is_empty());
    }
    #[test]
    fn view_closure_keeps_an_interrupted_record_and_refuses_opening_it() {
        let directory = tempfile::tempdir().unwrap();
        let downloads = Downloads::at(directory.path().to_path_buf());
        downloads
            .requested(
                "view",
                "https://example.invalid/file",
                Path::new("report.txt"),
            )
            .unwrap();
        downloads.close_view("view");
        let item = &downloads.snapshot().unwrap()[0];
        assert_eq!(item["state"], "interrupted");
        assert!(downloads.path(item["id"].as_str().unwrap()).is_err());
    }
}
