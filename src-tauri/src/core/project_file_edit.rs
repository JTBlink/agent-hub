//! Save existing text files inside an authorized project/worktree.
use anyhow::{bail, Context, Result};
use std::{io::Write, path::Path};

pub fn save(root: &Path, relative: &str, expected: &str, content: &str) -> Result<()> {
    static SAVES: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = SAVES.lock().unwrap_or_else(|error| error.into_inner());
    if Path::new(relative).components().any(|part| {
        part.as_os_str()
            .to_string_lossy()
            .eq_ignore_ascii_case(".git")
    }) {
        bail!("Git metadata cannot be edited as a workspace file");
    }
    if content.len() > 1024 * 1024 || content.contains('\0') {
        bail!("Text file exceeds the editor limit");
    }
    // Reuse the reader's canonical path and UTF-8/size boundary.
    let current = super::project_worktrees::read_file(root, relative)?;
    if current != expected {
        bail!("File changed on disk. Reload before saving; your draft is preserved.");
    }
    let path = root.join(relative);
    let metadata = std::fs::symlink_metadata(&path)?;
    if metadata.permissions().readonly() {
        bail!("File is read-only");
    }
    if super::path_guard::is_link_or_reparse_point(&metadata) {
        bail!("Linked files cannot be edited");
    }
    let mut temporary =
        tempfile::NamedTempFile::new_in(path.parent().context("Missing file parent")?)?;
    temporary
        .as_file()
        .set_permissions(metadata.permissions())?;
    temporary.write_all(content.as_bytes())?;
    temporary.as_file().sync_all()?;
    // Check again after preparing the replacement, before committing it.
    if super::project_worktrees::read_file(root, relative)? != expected {
        bail!("File changed on disk. Reload before saving; your draft is preserved.");
    }
    temporary.persist(&path).map_err(|error| error.error)?;
    Ok(())
}

#[cfg(test)]
mod tests;
