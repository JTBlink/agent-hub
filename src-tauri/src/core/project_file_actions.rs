//! File tree operations within an already authorized checkout.
use anyhow::{bail, Context, Result};
use serde::Deserialize;
use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use super::{path_guard, project_worktrees};

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum FileAction {
    NewFile { name: String },
    NewDirectory { name: String },
    Rename { name: String },
    Delete,
}

/// Reject links in every component, including links pointing inside the checkout.
pub fn existing_path(root: &Path, relative: &str) -> Result<PathBuf> {
    let path = project_worktrees::file_path(root, relative)?;
    let mut current = root.to_path_buf();
    for part in Path::new(relative).components() {
        if part
            .as_os_str()
            .to_string_lossy()
            .eq_ignore_ascii_case(".git")
        {
            bail!("Git metadata cannot be changed as a workspace file");
        }
        current.push(part);
        if path_guard::is_link_or_reparse_point(&fs::symlink_metadata(&current)?) {
            bail!("Linked files and directories cannot be used for this operation");
        }
    }
    fs::symlink_metadata(&path).context("Workspace entry is no longer available")?;
    Ok(path)
}

fn named_child(parent: &Path, name: &str) -> Result<PathBuf> {
    let mut components = Path::new(name).components();
    if name.trim().is_empty()
        || name != name.trim()
        || name.contains(['/', '\\'])
        || name
            .chars()
            .any(|c| c.is_control() || matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        || name.ends_with('.')
        || !matches!(components.next(), Some(Component::Normal(_)))
        || components.next().is_some()
        || name.eq_ignore_ascii_case(".git")
    {
        bail!("Enter a single file or directory name without path separators");
    }
    let target = parent.join(name);
    if fs::symlink_metadata(&target).is_ok() {
        bail!("An entry with this name already exists");
    }
    Ok(target)
}

// Refuse destructive operations on embedded repositories or linked checkouts.
// Bound the scan so selecting a huge directory cannot monopolize the worker.
fn protect_repositories(path: &Path) -> Result<()> {
    let mut pending = vec![path.to_path_buf()];
    let mut visited = 0;
    while let Some(current) = pending.pop() {
        let metadata = fs::symlink_metadata(&current)?;
        if !metadata.is_dir() || path_guard::is_link_or_reparse_point(&metadata) {
            continue;
        }
        for entry in fs::read_dir(current)? {
            let entry = entry?;
            visited += 1;
            if visited > 100_000 {
                bail!("Directory is too large; manage it in your file manager");
            }
            if entry
                .file_name()
                .to_string_lossy()
                .eq_ignore_ascii_case(".git")
            {
                bail!("Directories containing Git metadata cannot be renamed or deleted here");
            }
            if entry.file_type()?.is_dir() {
                pending.push(entry.path());
            }
        }
    }
    Ok(())
}

pub fn apply(root: &Path, relative: &str, action: FileAction) -> Result<String> {
    static OPERATIONS: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = OPERATIONS.lock().unwrap_or_else(|error| error.into_inner());
    let source = existing_path(root, relative)?;
    let target = match action {
        FileAction::NewFile { name } => {
            let target = named_child(&source, &name)?;
            fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&target)?;
            target
        }
        FileAction::NewDirectory { name } => {
            let target = named_child(&source, &name)?;
            fs::create_dir(&target)?;
            target
        }
        FileAction::Rename { name } => {
            if relative.is_empty() {
                bail!("The checkout root cannot be renamed");
            }
            protect_repositories(&source)?;
            let target = named_child(source.parent().context("Missing parent directory")?, &name)?;
            rename_without_replace(&source, &target)?;
            target
        }
        FileAction::Delete => {
            if relative.is_empty() {
                bail!("The checkout root cannot be deleted");
            }
            protect_repositories(&source)?;
            if source.is_dir() {
                fs::remove_dir_all(&source)?;
            } else {
                fs::remove_file(&source)?;
            }
            source
        }
    };
    Ok(target
        .strip_prefix(root)?
        .to_string_lossy()
        .replace('\\', "/"))
}

// A preflight exists check alone would allow a concurrent writer to be overwritten.
fn rename_without_replace(source: &Path, target: &Path) -> Result<()> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        use std::{ffi::CString, os::unix::ffi::OsStrExt};
        let source = CString::new(source.as_os_str().as_bytes())?;
        let target = CString::new(target.as_os_str().as_bytes())?;
        #[cfg(target_os = "macos")]
        let result =
            unsafe { libc::renamex_np(source.as_ptr(), target.as_ptr(), libc::RENAME_EXCL) };
        #[cfg(target_os = "linux")]
        let result = unsafe {
            libc::renameat2(
                libc::AT_FDCWD,
                source.as_ptr(),
                libc::AT_FDCWD,
                target.as_ptr(),
                libc::RENAME_NOREPLACE,
            )
        };
        if result != 0 {
            return Err(std::io::Error::last_os_error().into());
        }
        Ok(())
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        // Windows rename fails if the destination already exists.
        fs::rename(source, target)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests;
