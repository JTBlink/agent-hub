use crate::core::{clipboard, clipboard::ClipboardContent, error::AppError};
use anyhow::Context;
use tauri::{Manager, Webview};
use tauri_plugin_clipboard_manager::ClipboardExt;

#[derive(serde::Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TerminalClipboard {
    Text { text: String },
    Image,
}

/// Read file references before text/image alternatives supplied by file managers.
#[tauri::command]
pub async fn terminal_read_clipboard(window: Webview) -> Result<TerminalClipboard, AppError> {
    super::terminal::owner(&window)?;
    let app = window.app_handle().clone();
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        clipboard::files::request_files(move |result| {
            let _ = sender.send(result);
        });
    })?;
    let paths = tokio::time::timeout(std::time::Duration::from_secs(10), receiver)
        .await
        .map_err(AppError::io)?
        .map_err(AppError::io)?
        .map_err(AppError::io)?;
    // Clipboard reads must not block GTK's main thread.
    tauri::async_runtime::spawn_blocking(move || {
        let clipboard = app.clipboard();
        let content = clipboard::read_content(
            paths,
            || clipboard.read_image().is_ok(),
            || clipboard.read_text().map_err(Into::into),
        )
        .map_err(AppError::io)?;
        match content {
            ClipboardContent::Files(paths) => {
                let text = crate::core::terminal::clipboard::file_input(&paths)
                    .and_then(|text| text.context("Clipboard contains no file paths"))
                    .map_err(AppError::io)?;
                Ok(TerminalClipboard::Text { text })
            }
            ClipboardContent::Image => Ok(TerminalClipboard::Image),
            ClipboardContent::Text(text) => Ok(TerminalClipboard::Text { text }),
        }
    })
    .await
    .map_err(AppError::io)?
}
