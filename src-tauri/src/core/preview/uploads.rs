//! Files enter a page only after the desktop's native picker grants access.
use super::{super::error::AppError, browser::Browsers};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::json;
use std::path::PathBuf;
impl Browsers {
    pub fn upload_files(
        &self,
        id: &str,
        revision: &str,
        token: &str,
        files: &[PathBuf],
    ) -> Result<(), AppError> {
        if files.is_empty() || files.len() > 20 {
            return Err(AppError::invalid_input(
                "Choose between one and twenty files",
            ));
        }
        // Bound both local and remote selection before mutating the file input.
        let mut total = 0u64;
        for path in files {
            let metadata = std::fs::metadata(path)?;
            total += metadata.len();
            if !metadata.is_file() || total > 10 * 1024 * 1024 {
                return Err(AppError::invalid_input(
                    "Selected files exceed the 10 MiB upload limit",
                ));
            }
        }
        let (page, remote) = {
            let state = self
                .state
                .lock()
                .map_err(|_| AppError::internal("Browser state unavailable"))?;
            let handle = state
                .pages
                .get(id)
                .ok_or_else(|| AppError::not_found("Browser page closed"))?;
            let runtime = state
                .runtimes
                .get(&handle.profile)
                .cloned()
                .ok_or_else(|| AppError::not_found("Browser runtime unavailable"))?;
            (handle.page.clone(), runtime)
        };
        let remote = remote
            .lock()
            .map_err(|_| AppError::internal("Browser runtime unavailable"))?
            .context
            .is_some();
        let mut page = page
            .lock()
            .map_err(|_| AppError::internal("Browser page unavailable"))?;
        let chooser = page
            .cdp
            .chooser
            .clone()
            .filter(|chooser| chooser["token"] == token)
            .ok_or_else(|| AppError::cancelled("File selection expired; choose the input again"))?;
        if page.identity()?.0 != revision {
            return Err(AppError::cancelled("Page changed during file selection"));
        }
        if files.len() > 1 && chooser["mode"] != "selectMultiple" {
            return Err(AppError::invalid_input("This input accepts one file"));
        }
        let node = chooser["backendNodeId"]
            .as_u64()
            .ok_or_else(|| AppError::invalid_input("File input unavailable"))?;
        if remote {
            // Stage bytes in the remote browser's memory, never send a local path to its host.
            let mut staged = Vec::new();
            let mut transferred = 0usize;
            for path in files {
                let bytes = std::fs::read(path)?;
                transferred += bytes.len();
                if transferred > 10 * 1024 * 1024 {
                    return Err(AppError::invalid_input(
                        "File changed beyond the upload limit",
                    ));
                }
                staged.push(json!({"name":path.file_name().unwrap_or_default().to_string_lossy(),"data":STANDARD.encode(bytes),"mime":super::assets::mime(path).split(';').next().unwrap_or("application/octet-stream")}));
            }
            let object = page
                .cdp
                .call("DOM.resolveNode", json!({"backendNodeId":node}))?;
            let object = object["object"]["objectId"]
                .as_str()
                .ok_or_else(|| AppError::invalid_input("File input unavailable"))?;
            let result = page.cdp.call("Runtime.callFunctionOn",json!({"objectId":object,"functionDeclaration":"function(files){if(!this.isConnected||this.type!=='file')throw Error('File input unavailable');const transfer=new DataTransfer();for(const file of files){const data=Uint8Array.from(atob(file.data),c=>c.charCodeAt(0));transfer.items.add(new File([data],file.name,{type:file.mime}));}this.files=transfer.files;this.dispatchEvent(new Event('input',{bubbles:true}));this.dispatchEvent(new Event('change',{bubbles:true}));return true;}","arguments":[{"value":staged}],"returnByValue":true}))?;
            let _ = page
                .cdp
                .call("Runtime.releaseObject", json!({"objectId":object}));
            if result.get("exceptionDetails").is_some() {
                return Err(AppError::invalid_input(
                    "Remote file input rejected the selection",
                ));
            }
        } else {
            page.cdp.call("DOM.setFileInputFiles",json!({"backendNodeId":node,"files":files.iter().map(|path|path.to_string_lossy()).collect::<Vec<_>>()}))?;
        }
        page.cdp.chooser = None;
        Ok(())
    }
}

#[cfg(test)]
#[path = "uploads/tests.rs"]
mod tests;
