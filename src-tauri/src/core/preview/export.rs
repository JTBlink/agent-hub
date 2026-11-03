//! Export is revalidated after the native save dialog, before touching the destination.
use super::{super::error::AppError, browser::Browsers};
use serde::Deserialize;
use std::path::Path;
#[derive(Deserialize)]
pub struct ExpectedPage {
    pub id: String,
    pub revision: String,
}
pub fn write(
    browsers: &Browsers,
    destination: &Path,
    bytes: &[u8],
    expected: Option<&ExpectedPage>,
) -> Result<(), AppError> {
    if let Some(expected) = expected {
        let page = browsers.page(&expected.id)?;
        let mut page = page
            .lock()
            .map_err(|_| AppError::internal("Browser page unavailable"))?;
        if page.identity()?.0 != expected.revision {
            return Err(AppError::cancelled("PREVIEW_CONTEXT_CHANGED"));
        }
        std::fs::write(destination, bytes)?;
    } else {
        std::fs::write(destination, bytes)?;
    }
    Ok(())
}
#[cfg(test)]
#[path = "export/tests.rs"]
mod tests;
