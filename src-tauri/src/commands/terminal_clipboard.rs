use crate::core::error::AppError;
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
        crate::core::project_file_actions::paste::request_files(move |result| {
            let _ = sender.send(result);
        });
    })?;
    let paths = tokio::time::timeout(std::time::Duration::from_secs(10), receiver)
        .await
        .map_err(AppError::io)?
        .map_err(AppError::io)?
        .map_err(AppError::io)?;
    if let Some(text) =
        crate::core::terminal::clipboard::file_input(&paths).map_err(AppError::io)?
    {
        return Ok(TerminalClipboard::Text { text });
    }
    // Clipboard reads must not block GTK's main thread.
    tauri::async_runtime::spawn_blocking(move || {
        let clipboard = app.clipboard();
        if clipboard.read_image().is_ok() {
            return Ok(TerminalClipboard::Image);
        }
        clipboard
            .read_text()
            .map(|text| TerminalClipboard::Text { text })
            .map_err(AppError::io)
    })
    .await
    .map_err(AppError::io)?
}
