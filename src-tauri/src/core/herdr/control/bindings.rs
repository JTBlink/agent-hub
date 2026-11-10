use super::*;
use crate::core::skill_store::SkillStore;

pub(super) fn resolve_project(store: &SkillStore, directory: &Path) -> Result<String> {
    crate::core::workspace_registration::resolve_project(store, directory)
}
