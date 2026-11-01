//! Default for new deployments; legacy scope settings stay effective until chosen.
use super::{error::AppError, skill_store::SkillStore, sync_engine::SyncMode};

pub const SETTING: &str = "deployment_mode";

#[derive(Clone, Copy)]
pub enum Scope {
    Global,
    Linked,
    Project,
}

pub struct Preference {
    mode: SyncMode,
    preserve_existing: bool,
}

fn valid(value: Option<String>) -> Option<SyncMode> {
    match value.as_deref() {
        Some("symlink") => Some(SyncMode::Symlink),
        Some("copy") => Some(SyncMode::Copy),
        _ => None,
    }
}

impl Preference {
    pub fn load(store: &SkillStore, scope: Scope) -> Result<Self, AppError> {
        if let Some(mode) = valid(store.get_setting(SETTING).map_err(AppError::db)?) {
            return Ok(Self {
                mode,
                preserve_existing: true,
            });
        }
        let global = || {
            store
                .get_setting("sync_mode")
                .map_err(AppError::db)
                .map(valid)
        };
        let mode = match scope {
            Scope::Global => global()?,
            Scope::Linked => match store
                .get_setting("project_sync_mode")
                .map_err(AppError::db)?
            {
                Some(value) => Some(valid(Some(value)).unwrap_or(SyncMode::Symlink)),
                None => global()?,
            },
            // Ordinary projects never consumed the two legacy preferences.
            Scope::Project => None,
        }
        .unwrap_or(SyncMode::Symlink);
        Ok(Self {
            mode,
            preserve_existing: false,
        })
    }

    /// Existing targets keep their recorded form when the unified default changes.
    pub fn for_target(&self, recorded: Option<&str>) -> SyncMode {
        if self.preserve_existing {
            if let Some(mode) = valid(recorded.map(str::to_owned)) {
                return mode;
            }
        }
        self.mode
    }

    /// Per-install overrides take precedence over the default.
    pub fn for_install(&self, copy: Option<bool>) -> SyncMode {
        match copy {
            Some(true) => SyncMode::Copy,
            Some(false) => SyncMode::Symlink,
            None => self.mode,
        }
    }
}

#[cfg(test)]
mod tests;
