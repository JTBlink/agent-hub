//! Thin WebView callback adapter; download state and file checks live in core.
use super::NativeViews;
pub use crate::core::preview::native_downloads::Downloads;
use tauri::Manager;

/// Attach the system engine's own download callbacks without introducing a browser runtime.
pub fn handle(view: tauri::Webview, event: tauri::webview::DownloadEvent<'_>) -> bool {
    use tauri::webview::DownloadEvent;
    let state = view.state::<NativeViews>();
    match event {
        DownloadEvent::Requested { url, destination } => {
            match state
                .downloads
                .requested(view.label(), url.as_str(), destination)
            {
                Ok(path) => {
                    *destination = path;
                    true
                }
                Err(_) => false,
            }
        }
        DownloadEvent::Finished { url, success, .. } => {
            state
                .downloads
                .finished(view.label(), url.as_str(), success);
            true
        }
        _ => true,
    }
}
