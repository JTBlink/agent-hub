//! Result callbacks and capture use the actual system view, never an emulated Chromium page.
use crate::core::error::AppError;
use serde_json::Value;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
mod macos_cookies;
#[cfg(target_os = "macos")]
pub use macos::{evaluate, query, snapshot, theme, user_agent};
#[cfg(target_os = "macos")]
pub use macos_cookies::{cookies, mutate_cookie};
/// A bounded reply; closing a view or losing its renderer cannot leave IPC waiting forever.
async fn receive<T>(
    receiver: tokio::sync::oneshot::Receiver<Result<T, AppError>>,
) -> Result<T, AppError> {
    tokio::time::timeout(std::time::Duration::from_secs(8), receiver)
        .await
        .map_err(|_| AppError::network("Native page did not respond; reload the page"))?
        .map_err(|_| AppError::network("Native page was closed"))?
}

#[cfg(not(target_os = "macos"))]
pub async fn cookies(
    _: &tauri::Webview,
) -> Result<Vec<crate::core::preview::cookies::policy::Cookie>, AppError> {
    Err(AppError::invalid_input(
        "Native cookie import is unavailable on this platform",
    ))
}
#[cfg(not(target_os = "macos"))]
pub async fn mutate_cookie(
    _: &tauri::Webview,
    _: crate::core::preview::cookies::policy::Cookie,
    _: bool,
) -> Result<(), AppError> {
    Err(AppError::invalid_input(
        "Native cookie import is unavailable on this platform",
    ))
}

mod script;
#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::{evaluate, query, snapshot, theme, user_agent};
#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use linux::{evaluate, query, snapshot, theme, user_agent};
