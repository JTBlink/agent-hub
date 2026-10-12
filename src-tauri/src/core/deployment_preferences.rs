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
mod tests {
    use super::*;

    #[test]
    fn legacy_scope_preferences_survive_until_unified_default_is_selected() {
        let temp = tempfile::tempdir().unwrap();
        let store = SkillStore::new(&temp.path().join("test.db")).unwrap();
        store.set_setting("sync_mode", "copy").unwrap();
        store.set_setting("project_sync_mode", "symlink").unwrap();
        assert_eq!(
            Preference::load(&store, Scope::Global)
                .unwrap()
                .for_install(None)
                .as_str(),
            "copy"
        );
        assert_eq!(
            Preference::load(&store, Scope::Linked)
                .unwrap()
                .for_install(None)
                .as_str(),
            "symlink"
        );
        assert_eq!(
            Preference::load(&store, Scope::Project)
                .unwrap()
                .for_install(None)
                .as_str(),
            "symlink"
        );
        store.set_setting(SETTING, "copy").unwrap();
        for scope in [Scope::Global, Scope::Linked, Scope::Project] {
            let preference = Preference::load(&store, scope).unwrap();
            assert_eq!(preference.for_install(None).as_str(), "copy");
            assert_eq!(preference.for_install(Some(false)).as_str(), "symlink");
            assert_eq!(preference.for_target(Some("symlink")).as_str(), "symlink");
        }
        assert_eq!(
            store.get_setting("project_sync_mode").unwrap().as_deref(),
            Some("symlink")
        );
    }

    #[test]
    fn fresh_and_invalid_preferences_default_to_links_with_explicit_copy_override() {
        let temp = tempfile::tempdir().unwrap();
        let store = SkillStore::new(&temp.path().join("test.db")).unwrap();
        store.set_setting(SETTING, "invalid").unwrap();
        for scope in [Scope::Global, Scope::Linked, Scope::Project] {
            let preference = Preference::load(&store, scope).unwrap();
            assert_eq!(preference.for_install(None).as_str(), "symlink");
            assert_eq!(preference.for_install(Some(true)).as_str(), "copy");
        }
        store.set_setting(SETTING, "symlink").unwrap();
        assert_eq!(
            Preference::load(&store, Scope::Global)
                .unwrap()
                .for_target(Some("copy"))
                .as_str(),
            "copy"
        );
    }
}
