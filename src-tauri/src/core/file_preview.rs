use std::{fs, path::PathBuf, sync::Mutex};

use tempfile::TempDir;

use super::{error::AppError, path_guard::ensure_safe_skill_relative_path};

/// Own preview copies for the application session, including after the reader closes.
/// Dropping the state removes the temporary directories; original files are never touched.
#[derive(Default)]
pub struct FilePreviews {
    session: Mutex<PreviewSession>,
}

#[derive(Default)]
struct PreviewSession {
    directories: Vec<TempDir>,
    closed: bool,
}

impl FilePreviews {
    /// Remove session copies during orderly quit or restart, before process exit.
    pub fn clear(&self) -> Result<(), AppError> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| AppError::internal("Preview state is unavailable"))?;
        // A pending writer must not publish another copy after quit cleanup.
        session.closed = true;
        session.directories.clear();
        Ok(())
    }

    /// Materialize the exact text shown in the reader without installing or running it.
    pub fn prepare(&self, path: &str, content: &str) -> Result<PathBuf, AppError> {
        ensure_safe_skill_relative_path(path)?;
        if path.contains(['\\', ':']) || content.len() > 4 * 1024 * 1024 {
            return Err(AppError::invalid_input(
                "Invalid preview path or text exceeds 4 MiB",
            ));
        }
        let directory = tempfile::Builder::new()
            .prefix("agent-hub-preview-")
            .tempdir()
            .map_err(AppError::io)?;
        let file = directory.path().join(path);
        if let Some(parent) = file.parent() {
            fs::create_dir_all(parent).map_err(AppError::io)?;
        }
        fs::write(&file, content).map_err(AppError::io)?;
        let mut session = self
            .session
            .lock()
            .map_err(|_| AppError::internal("Preview state is unavailable"))?;
        if session.closed {
            return Err(AppError::cancelled("Preview session has ended"));
        }
        session.directories.push(directory);
        Ok(file)
    }
}

#[cfg(test)]
mod tests;
