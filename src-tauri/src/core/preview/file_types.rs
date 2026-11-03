//! Browser-preview capabilities shared with the file-tree UI.
use serde::Deserialize;
use std::{path::Path, sync::OnceLock};

#[derive(Deserialize)]
struct FileType {
    extensions: Vec<String>,
    mime: String,
    kind: String,
}
static TYPES: OnceLock<Vec<FileType>> = OnceLock::new();
fn lookup(path: &Path) -> Option<&'static FileType> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    TYPES
        .get_or_init(|| {
            serde_json::from_str(include_str!("../../../../shared/preview-file-types.json"))
                .expect("bundled preview file types must be valid")
        })
        .iter()
        .find(|entry| entry.extensions.contains(&extension))
}
pub(super) fn kind(path: &Path) -> Option<&'static str> {
    lookup(path).map(|entry| entry.kind.as_str())
}
pub(super) fn mime(path: &Path) -> Option<&'static str> {
    lookup(path).map(|entry| entry.mime.as_str())
}
