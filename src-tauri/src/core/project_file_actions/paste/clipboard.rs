//! Read file references only; plain clipboard text never grants file access.
use anyhow::Result;
use std::path::PathBuf;

#[cfg(not(target_os = "linux"))]
pub fn request_files(done: impl FnOnce(Result<Vec<PathBuf>>) + 'static) {
    done(read_files());
}

#[cfg(target_os = "macos")]
pub fn read_files() -> Result<Vec<PathBuf>> {
    read_pasteboard(&objc2_app_kit::NSPasteboard::generalPasteboard())
}

#[cfg(target_os = "macos")]
fn read_pasteboard(board: &objc2_app_kit::NSPasteboard) -> Result<Vec<PathBuf>> {
    use objc2_foundation::NSString;
    let kind = NSString::from_str("public.file-url");
    let mut paths = Vec::new();
    if let Some(items) = board.pasteboardItems() {
        anyhow::ensure!(items.len() <= 4000, "Paste up to 4000 entries at a time");
        for item in items {
            if let Some(value) = item.stringForType(&kind) {
                paths.push(file_url(&value.to_string())?);
            }
        }
    }
    Ok(paths)
}

#[cfg(target_os = "linux")]
pub fn request_files(done: impl FnOnce(Result<Vec<PathBuf>>) + 'static) {
    // Request asynchronously on GTK's main thread without blocking its event loop.
    gtk::Clipboard::get(&gtk::gdk::SELECTION_CLIPBOARD).request_uris(move |_, uris| {
        done(uris.iter().map(|uri| file_url(uri)).collect());
    });
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn file_url(value: &str) -> Result<PathBuf> {
    tauri::Url::parse(value)?
        .to_file_path()
        .map_err(|_| anyhow::anyhow!("Clipboard entry is not a local file URL"))
}

#[cfg(all(test, target_os = "macos"))]
#[path = "clipboard_tests.rs"]
mod tests;

#[cfg(windows)]
pub fn read_files() -> Result<Vec<PathBuf>> {
    use std::{ffi::OsString, os::windows::ffi::OsStringExt};
    use windows::Win32::{
        System::DataExchange::{CloseClipboard, GetClipboardData, OpenClipboard},
        UI::Shell::{DragQueryFileW, HDROP},
    };
    struct Clipboard;
    impl Drop for Clipboard {
        fn drop(&mut self) {
            let _ = unsafe { CloseClipboard() };
        }
    }
    unsafe {
        OpenClipboard(None)?;
    }
    let _clipboard = Clipboard;
    let Ok(handle) = (unsafe { GetClipboardData(15) }) else {
        return Ok(Vec::new());
    };
    let drop = HDROP(handle.0);
    let count = unsafe { DragQueryFileW(drop, u32::MAX, None) };
    anyhow::ensure!(count <= 4000, "Paste up to 4000 entries at a time");
    let mut paths = Vec::new();
    for index in 0..count {
        let len = unsafe { DragQueryFileW(drop, index, None) };
        let mut buffer = vec![0u16; len as usize + 1];
        let copied = unsafe { DragQueryFileW(drop, index, Some(&mut buffer)) };
        paths.push(PathBuf::from(OsString::from_wide(
            &buffer[..copied as usize],
        )));
    }
    Ok(paths)
}
