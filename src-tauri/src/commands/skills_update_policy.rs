use std::path::Path;

use crate::core::{
    error::AppError,
    installer, skill_metadata,
    skill_store::{SkillRecord, SkillStore},
    skill_versions,
};

/// A newer library copy is not an incoming update, including for old cached rows.
pub(super) fn display_update_status(skill: &SkillRecord, version: Option<&str>) -> String {
    if matches!(
        skill.update_status.as_str(),
        "error" | "updating" | "checking"
    ) {
        return skill.update_status.clone();
    }
    if matches!(skill.source_type.as_str(), "local" | "import") {
        if let Some(source) = skill.source_ref.as_deref().map(Path::new) {
            let source_version = skill_metadata::parse_skill_md(source).version;
            if skill_versions::compare_versions(version, source_version.as_deref())
                == "central_newer"
            {
                return "central_newer".into();
            }
            // The source may overtake the library before the cached check expires.
            if skill.update_status == "central_newer" {
                if !source.exists() {
                    return "source_missing".into();
                }
                if let Ok(hash) = installer::hash_local_source(source) {
                    return local_source_status(skill, source, &hash).0.into();
                }
            }
        }
    }
    skill.update_status.clone()
}

/// Decline a downgrade before any swap or deployment write, even for stale UI requests.
pub(super) fn preserve_newer_library(
    store: &SkillStore,
    skill: &SkillRecord,
    staged: &Path,
    remote_revision: Option<&str>,
) -> Result<bool, AppError> {
    if skill_versions::compare_directories(Path::new(&skill.central_path), staged)
        != "central_newer"
    {
        return Ok(false);
    }
    store
        .update_skill_check_state(&skill.id, remote_revision, "central_newer", None)
        .map_err(AppError::db)?;
    Ok(true)
}

pub(super) fn local_source_status(
    skill: &SkillRecord,
    source: &Path,
    live_hash: &str,
) -> (&'static str, Option<String>) {
    let central = Path::new(&skill.central_path);
    match skill_versions::compare_directories(central, source) {
        "central_newer" => return ("central_newer", None),
        "source_newer" => return ("update_available", None),
        _ => {}
    }
    match skill.content_hash.as_deref() {
        None => ("local_only", None),
        Some(stored) if stored == live_hash => ("up_to_date", None),
        Some(_) if differs_only_by_line_endings(source, central) => ("up_to_date", None),
        Some(_) => ("update_available", None),
    }
}

/// Windows Git checkouts can differ only in CRLF/LF encoding. Compare live trees
/// with the shared install scope; read failures must never assert sameness.
fn differs_only_by_line_endings(source: &Path, central: &Path) -> bool {
    let (Ok(source_hash), Ok(central_hash)) = (
        installer::hash_local_source_eol_insensitive(source),
        crate::core::content_hash::hash_directory_eol_insensitive(central),
    ) else {
        return false;
    };
    source_hash == central_hash
}
