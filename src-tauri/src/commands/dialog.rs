use std::path::PathBuf;

#[tauri::command]
pub async fn pick_directory(
    default_path: Option<String>,
    window: tauri::Window,
) -> Result<Option<String>, String> {
    pick_directory_impl(default_path, window)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
async fn pick_directory_impl(
    default_path: Option<String>,
    window: tauri::Window,
) -> Result<Option<String>, anyhow::Error> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    window
        .run_on_main_thread(move || {
            let _ = tx.send(open_panel_with_hidden_files(default_path));
        })
        .map_err(|e| anyhow::anyhow!("failed to run on main thread: {e}"))?;
    Ok(rx.await?)
}

#[cfg(target_os = "macos")]
fn open_panel_with_hidden_files(default_path: Option<String>) -> Option<String> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSModalResponseOK, NSOpenPanel};

    // Safe: this function is only called via run_on_main_thread.
    let mtm = unsafe { MainThreadMarker::new_unchecked() };
    let panel = NSOpenPanel::openPanel(mtm);

    panel.setCanChooseDirectories(true);
    panel.setCanChooseFiles(false);
    panel.setCanCreateDirectories(true);
    panel.setShowsHiddenFiles(true);

    if let Some(path) = &default_path {
        let path = PathBuf::from(path);
        if path.is_dir() {
            let url = objc2_foundation::NSURL::fileURLWithPath(
                &objc2_foundation::NSString::from_str(&path.to_string_lossy()),
            );
            panel.setDirectoryURL(Some(&url));
        }
    }

    let response = panel.runModal();
    if response == NSModalResponseOK {
        panel
            .URL()
            .and_then(|url| url.path())
            .map(|p| p.to_string())
    } else {
        None
    }
}

#[cfg(not(target_os = "macos"))]
async fn pick_directory_impl(
    default_path: Option<String>,
    _window: tauri::Window,
) -> Result<Option<String>, anyhow::Error> {
    let mut dialog = rfd::AsyncFileDialog::new();
    if let Some(ref p) = default_path {
        let path = PathBuf::from(p);
        if path.is_dir() {
            dialog = dialog.set_directory(&path);
        }
    }
    Ok(dialog
        .pick_folder()
        .await
        .map(|h| h.path().to_string_lossy().into_owned()))
}
