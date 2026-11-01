//! Filesystem transitions for project skill enable/disable operations.

use std::path::Path;

use super::{
    error::AppError,
    path_guard::{ensure_dir_within_root, ensure_safe_skill_relative_path},
    sync_engine,
};

// Walks upward from `start`, removing each empty directory until reaching
// (and including) `root`. Stops at the first non-empty directory or any
// other error. `fs::remove_dir` only succeeds on empty directories, so this
// will never delete a directory that still holds skills.
fn cleanup_empty_dirs_up_to(start: &Path, root: &Path) {
    let Ok(root_canonical) = std::fs::canonicalize(root) else {
        return;
    };
    let mut current = start.to_path_buf();
    loop {
        let Ok(current_canonical) = std::fs::canonicalize(&current) else {
            return;
        };
        if !current_canonical.starts_with(&root_canonical) {
            return;
        }
        if std::fs::remove_dir(&current).is_err() {
            return;
        }
        if current_canonical == root_canonical {
            return;
        }
        match current.parent() {
            Some(parent) => current = parent.to_path_buf(),
            None => return,
        }
    }
}

fn remove_symlink_entry(path: &Path) -> Result<(), AppError> {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(err) => return Err(AppError::io(err)),
    };
    if !metadata.file_type().is_symlink() {
        return Err(AppError::invalid_input(
            "Duplicate skill entry is not a symlink — resolve manually",
        ));
    }
    sync_engine::remove_target(path).map_err(AppError::io)
}

pub(crate) fn set_project_skill_enabled_state(
    skills_dir: &Path,
    disabled_dir: &Path,
    skill_relative_path: &str,
    enabled: bool,
) -> Result<(), AppError> {
    ensure_safe_skill_relative_path(skill_relative_path)?;
    let _guard = super::project_skill_mutation::lock_project_skill_mutation()?;

    let enabled_path = skills_dir.join(skill_relative_path);
    let disabled_path = disabled_dir.join(skill_relative_path);

    if enabled {
        if enabled_path.is_dir() {
            ensure_dir_within_root(&enabled_path, skills_dir)?;
            if disabled_path.exists() {
                ensure_dir_within_root(&disabled_path, disabled_dir)?;
                remove_symlink_entry(&disabled_path)?;
                if let Some(parent) = disabled_path.parent() {
                    cleanup_empty_dirs_up_to(parent, disabled_dir);
                }
            }
            return Ok(());
        }

        if !disabled_path.is_dir() {
            return Err(AppError::not_found(
                "Skill directory not found in skills-disabled",
            ));
        }
        ensure_dir_within_root(&disabled_path, disabled_dir)?;
        if let Some(parent) = enabled_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        if enabled_path.exists() {
            return Err(AppError::invalid_input(
                "Skill already exists in skills directory",
            ));
        }
        std::fs::rename(&disabled_path, &enabled_path)?;
        if let Some(parent) = disabled_path.parent() {
            cleanup_empty_dirs_up_to(parent, disabled_dir);
        }
        return Ok(());
    }

    if disabled_path.is_dir() {
        ensure_dir_within_root(&disabled_path, disabled_dir)?;
        if enabled_path.exists() {
            ensure_dir_within_root(&enabled_path, skills_dir)?;
            remove_symlink_entry(&enabled_path)?;
        }
        return Ok(());
    }

    if !enabled_path.is_dir() {
        return Ok(());
    }
    ensure_dir_within_root(&enabled_path, skills_dir)?;
    if let Some(parent) = disabled_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if disabled_path.exists() {
        return Err(AppError::invalid_input(
            "Skill already exists in skills-disabled directory",
        ));
    }
    std::fs::rename(&enabled_path, &disabled_path)?;
    Ok(())
}

#[cfg(test)]
mod tests;
