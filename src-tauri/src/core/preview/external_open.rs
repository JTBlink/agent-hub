//! Bounded handoff of explicitly opened files to the main desktop workspace.
use super::{super::error::AppError, OpenedDocument, Preview};
use serde::Serialize;
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

#[derive(Default)]
pub struct ExternalOpens {
    pending: Mutex<Vec<OpenedDocument>>,
    signal: Mutex<Option<Arc<dyn Fn() + Send + Sync>>>,
}

#[derive(Debug, Serialize)]
pub struct OpenReceipt {
    pub id: String,
    pub path: PathBuf,
    pub status: &'static str,
}

impl Preview {
    pub fn set_external_open_signal(&self, signal: impl Fn() + Send + Sync + 'static) {
        *self
            .external_opens
            .signal
            .lock()
            .unwrap_or_else(|e| e.into_inner()) = Some(Arc::new(signal));
    }

    pub fn queue_external_document(&self, path: &str) -> Result<OpenReceipt, AppError> {
        if self.closed.load(std::sync::atomic::Ordering::Acquire) {
            return Err(AppError::cancelled("Preview is shutting down"));
        }
        let opened = self.open_document_path(path)?;
        let mut pending = self
            .external_opens
            .pending
            .lock()
            .map_err(|_| AppError::internal("File-open queue unavailable"))?;
        if self.closed.load(std::sync::atomic::Ordering::Acquire) {
            self.documents.close(&opened.document.id);
            return Err(AppError::cancelled("Preview is shutting down"));
        }
        let duplicate = pending
            .iter()
            .find(|item| item.document.path == opened.document.path);
        let receipt = if let Some(existing) = duplicate {
            self.documents.close(&opened.document.id);
            OpenReceipt {
                id: existing.document.id.clone(),
                path: existing.document.path.clone(),
                status: "requested",
            }
        } else {
            if pending.len() >= 12 {
                self.documents.close(&opened.document.id);
                return Err(AppError::invalid_input(
                    "Close or open pending documents first",
                ));
            }
            let receipt = OpenReceipt {
                id: opened.document.id.clone(),
                path: opened.document.path.clone(),
                status: "requested",
            };
            pending.push(opened);
            receipt
        };
        drop(pending);
        let signal = self
            .external_opens
            .signal
            .lock()
            .map_err(|_| AppError::internal("File-open signal unavailable"))?
            .clone();
        if let Some(signal) = signal {
            signal();
        }
        Ok(receipt)
    }

    pub fn take_external_documents(&self) -> Result<Vec<OpenedDocument>, AppError> {
        let mut pending = self
            .external_opens
            .pending
            .lock()
            .map_err(|_| AppError::internal("File-open queue unavailable"))?;
        Ok(std::mem::take(&mut *pending))
    }

    pub(super) fn clear_external_documents(&self) {
        if let Ok(documents) = self.take_external_documents() {
            for document in documents {
                self.documents.close(&document.document.id);
            }
        }
        self.external_opens
            .signal
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .take();
    }
}

#[cfg(test)]
mod tests;
