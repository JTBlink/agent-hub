use super::*;
use serde::Deserialize;
#[derive(Deserialize)]
pub struct Expected {
    id: String,
    revision: String,
}
#[tauri::command]
pub async fn preview_native_export(
    webview: tauri::Webview,
    name: String,
    content: String,
    binary: bool,
    expected: Expected,
) -> Result<bool, AppError> {
    let view = target(&webview, &expected.id)?;
    if content.len() > 24 * 1024 * 1024 || name.len() > 200 || name.contains(['/', '\\']) {
        return Err(AppError::invalid_input(
            "Export exceeds the supported limit",
        ));
    }
    let Some(file) = rfd::AsyncFileDialog::new()
        .set_file_name(&name)
        .save_file()
        .await
    else {
        return Ok(false);
    };
    let _job = webview.state::<NativeViews>().lock(&expected.id).await?;
    control::verify(&view, &expected.revision).await?;
    let path = file.path().to_path_buf();
    tauri::async_runtime::spawn_blocking(move || {
        use base64::Engine;
        let bytes = if binary {
            base64::engine::general_purpose::STANDARD
                .decode(content)
                .map_err(AppError::io)?
        } else {
            content.into_bytes()
        };
        std::fs::write(path, bytes).map_err(AppError::io)?;
        Ok(true)
    })
    .await?
}
