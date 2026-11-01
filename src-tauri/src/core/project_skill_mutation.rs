//! Serializes project writes whose Agent paths may alias the same directory.

use std::sync::{Mutex, MutexGuard};

use super::error::AppError;

// Hold across scanning/checking, removal, writing and cleanup. Commands acquire
// this on spawn_blocking workers before taking any short-lived store locks.
static PROJECT_SKILL_LOCK: Mutex<()> = Mutex::new(());

pub(crate) fn lock_project_skill_mutation() -> Result<MutexGuard<'static, ()>, AppError> {
    PROJECT_SKILL_LOCK.lock().map_err(|_| {
        AppError::internal("Project skill operation lock is unavailable; restart the application")
    })
}

#[cfg(all(test, unix))]
mod tests;
