//! Explicit access to the invoking window's local Web Inspector.

/// Toggle the local inspector where supported; WebView2 only supports opening it.
#[tauri::command]
pub async fn toggle_developer_tools(window: tauri::Webview) {
    #[cfg(not(target_os = "windows"))]
    if window.is_devtools_open() {
        window.close_devtools();
        return;
    }
    window.open_devtools();
}
