use super::*;

/// Apply an explicitly confirmed replacement to the existing library record.
/// The caller holds RepoLock. No name-based lookup or duplicate allocation occurs here.
pub(crate) fn overwrite_skill_unlocked(
    store: &SkillStore,
    skill_id: &str,
    source: &Path,
    metadata: &InstallSourceMetadata,
) -> Result<(), AppError> {
    let skill = store
        .get_skill_by_id(skill_id)
        .map_err(AppError::db)?
        .ok_or_else(|| AppError::not_found("Skill to overwrite no longer exists"))?;
    let destination = Path::new(&skill.central_path);
    if crate::core::skill_versions::compare_directories(destination, source) == "central_newer" {
        return Err(AppError::invalid_input(
            "Repository version is older than the installed Skill; sync the newer Skill to a local repository instead",
        ));
    }
    let library = central_repo::skills_dir();
    if destination == library
        || !sync_engine::is_library_entry(destination)
        || !path_guard::is_path_safe(&library, destination)
    {
        return Err(AppError::invalid_input(
            "Only managed library copies can be overwritten",
        ));
    }
    // Staging must not disguise overlapping user-owned source/library paths.
    sync_engine::ensure_dst_not_inside_src(source, destination).map_err(AppError::io)?;
    let staged_path = staged_path_for(&skill.central_path);
    let staged_guard = StagedPathGuard::new(&staged_path, true);
    let mut result = installer::install_skill_dir_to_destination(source, &skill.name, &staged_path)
        .map_err(AppError::io)?;
    swap_skill_directory(&staged_path, destination)?;
    staged_guard.release();
    result.central_path = destination.to_path_buf();
    // Reuse the current row, retaining its ID, tags, groups, enabled state and targets.
    store_installed_skill_unlocked(store, &result, metadata, None)?;
    resync_copy_targets(store, skill_id)?;
    sync_metadata::write_all_from_db_unlocked(store).map_err(AppError::db)?;
    Ok(())
}

pub(crate) fn overwrite_local_skill(
    store: &SkillStore,
    skill_id: &str,
    source: &Path,
) -> Result<(), AppError> {
    let metadata = InstallSourceMetadata {
        source_type: "local".to_string(),
        source_ref: Some(source.to_string_lossy().to_string()),
        source_ref_resolved: None,
        source_subpath: None,
        source_branch: None,
        source_revision: None,
        source_agent: None,
        remote_revision: None,
        update_status: "local_only".to_string(),
    };
    let _lock = RepoLock::acquire_foreground("overwrite skill from local Git repository")
        .map_err(AppError::db)?;
    overwrite_skill_unlocked(store, skill_id, source, &metadata)
}

pub(crate) fn validate_overwrite_targets(items: &[SkillInstallItem]) -> Result<(), AppError> {
    let mut targets = HashSet::new();
    for item in items {
        if let Some(id) = &item.overwrite_skill_id {
            if !targets.insert(id) {
                return Err(AppError::invalid_input(
                    "Select only one source per overwrite target",
                ));
            }
        }
    }
    Ok(())
}
