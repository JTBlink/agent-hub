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
mod tests {
    use super::*;

    #[test]
    fn preserves_nested_filename_and_exact_text_until_session_ends() {
        let previews = FilePreviews::default();
        let path = previews
            .prepare("scripts/check #示例.py", "print('ready')\r\n")
            .unwrap();
        assert!(path.ends_with("scripts/check #示例.py"));
        assert_eq!(fs::read_to_string(&path).unwrap(), "print('ready')\r\n");
        drop(previews);
        assert!(!path.exists());
    }

    #[test]
    fn repeated_previews_never_overwrite_copies_open_in_an_editor() {
        let previews = FilePreviews::default();
        let first = previews.prepare("config.json", "{}").unwrap();
        fs::write(&first, "edited externally").unwrap();
        let next = previews.prepare("config.json", "[]").unwrap();
        assert_ne!(first, next);
        assert_eq!(fs::read_to_string(first).unwrap(), "edited externally");
        assert_eq!(fs::read_to_string(next).unwrap(), "[]");
    }

    #[test]
    fn explicit_shutdown_removes_all_preview_copies() {
        let previews = FilePreviews::default();
        let path = previews.prepare("preview.py", "print('ready')").unwrap();
        previews.clear().unwrap();
        assert!(!path.exists());
        previews.clear().unwrap();
        assert!(previews.prepare("late.py", "text").is_err());
    }

    #[test]
    fn rejects_paths_outside_the_preview_and_oversized_content() {
        let previews = FilePreviews::default();
        for path in [
            "",
            "../escape.py",
            "/outside.py",
            "C:/outside.py",
            "scripts\\escape.py",
        ] {
            assert!(previews.prepare(path, "text").is_err(), "{path}");
        }
        assert!(previews
            .prepare("large.txt", &"x".repeat(4 * 1024 * 1024 + 1))
            .is_err());
    }
}
