//! Shared clipboard interpretation. File references take precedence over icons
//! and text alternatives; callers decide how to insert the resulting content.
pub mod files;

use anyhow::Result;
use std::path::PathBuf;

#[derive(Debug, PartialEq)]
pub enum ClipboardContent {
    Files(Vec<PathBuf>),
    Image,
    Text(String),
}

/// Read alternatives lazily so file icons are never decoded as pasted images.
/// Image detection failures fall back to the clipboard's plain text.
pub fn read_content(
    files: Vec<PathBuf>,
    has_image: impl FnOnce() -> bool,
    read_text: impl FnOnce() -> Result<String>,
) -> Result<ClipboardContent> {
    if !files.is_empty() {
        return Ok(ClipboardContent::Files(files));
    }
    if has_image() {
        return Ok(ClipboardContent::Image);
    }
    read_text().map(ClipboardContent::Text)
}

#[cfg(test)]
mod tests;
