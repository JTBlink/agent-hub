//! Native file grants for cookie imports; browser data never enters the renderer.
use crate::core::{
    error::AppError,
    preview::{cookies, Preview},
};
use std::sync::Arc;
use tauri::State;
#[tauri::command]
pub async fn preview_cookie_file(
    preview: State<'_, Arc<Preview>>,
    id: String,
    revision: String,
    format: String,
) -> Result<Option<cookies::Summary>, AppError> {
    if !["json", "netscape", "firefox"].contains(&format.as_str()) {
        return Err(AppError::invalid_input("Unsupported cookie file format"));
    }
    let dialog = rfd::AsyncFileDialog::new();
    let dialog = match format.as_str() {
        "json" => dialog.add_filter("Cookie JSON", &["json"]),
        "netscape" => dialog.add_filter("Netscape cookies", &["txt"]),
        _ => dialog.add_filter("Firefox cookies", &["sqlite"]),
    };
    let Some(file) = dialog.pick_file().await else {
        return Ok(None);
    };
    let path = file.path().to_path_buf();
    let preview = preview.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let value = cookies::sources::file(&path, &format)?;
        preview
            .cookie_imports
            .prepare(&preview.browsers, &id, &revision, value)
            .map(Some)
    })
    .await?
}
