use std::sync::Arc;
use tauri::State;

use crate::core::{error::AppError, file_preview::FilePreviews};

#[tauri::command]
pub async fn prepare_file_preview(
    path: String,
    content: String,
    previews: State<'_, Arc<FilePreviews>>,
) -> Result<String, AppError> {
    let previews = previews.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        previews
            .prepare(&path, &content)
            .map(|file| file.to_string_lossy().into_owned())
    })
    .await?
}
