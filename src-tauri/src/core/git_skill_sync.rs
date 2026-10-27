//! Explicitly publish a newer library Skill into a selected local Git working tree.
use std::path::Path;

use super::{
    content_hash, error::AppError, git_catalog, installer, path_guard, removals,
    repo_lock::RepoLock, skill_metadata, skill_store::SkillStore, skill_versions,
};

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, PartialEq, Eq)]
pub struct LocalSkillSyncApproval {
    pub library_hash: String,
    pub repository_hash: String,
    pub removed_paths: Vec<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct LocalSkillSyncPlan {
    pub library_version: Option<String>,
    pub repository_version: Option<String>,
    /// Absent when live versions do not permit publishing the library copy.
    pub approval: Option<LocalSkillSyncApproval>,
    pub applied: bool,
}

/// Without approval this only previews. Approval binds both live trees and removals.
/// Writes working-tree files only; never commits, pushes or changes library provenance.
/// Resolution, staging, approval validation and atomic publication stay in one lock scope.
pub fn sync_to_local_repository(
    store: &SkillStore,
    repository: &Path,
    repo_path: &str,
    skill_id: &str,
    approval: Option<LocalSkillSyncApproval>,
) -> Result<LocalSkillSyncPlan, AppError> {
    let _lock = RepoLock::acquire_foreground("sync newer skill to local repository")
        .map_err(AppError::db)?;
    let target = git_catalog::resolve_local_skill(repository, repo_path).map_err(AppError::git)?;
    // Replacing a repository root (or nested repository) would remove its Git metadata.
    if walkdir::WalkDir::new(&target)
        .into_iter()
        .any(|entry| match entry {
            Ok(entry) => entry.file_name() == ".git",
            Err(_) => true,
        })
    {
        return Err(AppError::invalid_input(
            "Select a Skill subdirectory without Git metadata",
        ));
    }
    let skill = store
        .get_skill_by_id(skill_id)
        .map_err(AppError::db)?
        .ok_or_else(|| AppError::not_found("Installed Skill no longer exists"))?;
    let source = Path::new(&skill.central_path).canonicalize()?;
    path_guard::ensure_disjoint_paths(&source, &target)?;
    let library_version = skill_metadata::parse_skill_md(&source).version;
    let repository_version = skill_metadata::parse_skill_md(&target).version;
    if skill_versions::compare_versions(library_version.as_deref(), repository_version.as_deref())
        != "central_newer"
    {
        // A stale catalog can offer sync even when the live versions no longer
        // qualify. Return a read-only status without authorizing a replacement.
        return Ok(LocalSkillSyncPlan {
            library_version,
            repository_version,
            approval: None,
            applied: false,
        });
    }
    let parent = target
        .parent()
        .ok_or_else(|| AppError::invalid_input("Invalid Skill path"))?;
    let staging = tempfile::Builder::new()
        .prefix(".skill-sync-")
        .tempdir_in(parent)?;
    let payload = staging.path().join("next");
    installer::install_skill_dir_to_destination(&source, &skill.name, &payload)
        .map_err(AppError::io)?;
    let snapshot = LocalSkillSyncApproval {
        library_hash: content_hash::hash_directory(&payload).map_err(AppError::io)?,
        repository_hash: content_hash::hash_directory(&target).map_err(AppError::io)?,
        removed_paths: removals::removed_paths(&target, &payload).map_err(AppError::io)?,
    };
    let mut plan = LocalSkillSyncPlan {
        library_version: skill_metadata::parse_skill_md(&payload).version,
        repository_version: skill_metadata::parse_skill_md(&target).version,
        approval: Some(snapshot),
        applied: false,
    };
    let Some(approval) = approval else {
        return Ok(plan);
    };
    if Some(approval) != plan.approval {
        return Err(AppError::invalid_input(
            "Skill content changed since confirmation; preview and confirm again",
        ));
    }
    // Keep the previous tree until publication succeeds; the staging directory is
    // on the same filesystem. No library record or deployment is modified.
    let previous = staging.path().join("previous");
    std::fs::rename(&target, &previous)?;
    if let Err(error) = std::fs::rename(&payload, &target) {
        if let Err(rollback) = std::fs::rename(&previous, &target) {
            let recovery = staging.keep();
            return Err(AppError::io(format!(
                "Sync failed: {error}; restore failed: {rollback}; original files retained at {}",
                recovery.join("previous").display()
            )));
        }
        return Err(error.into());
    }
    plan.applied = true;
    Ok(plan)
}
