use std::path::{Path, PathBuf};

use super::{
    error::{AppError, TargetConflictDetail},
    scenario_service::{deployment_target, is_skill_path_within_root, replace_policy},
    skill_metadata,
    skill_store::{SkillStore, SkillTargetRecord},
    sync_engine, tool_adapters, tool_service,
};

/// Why a caller is writing to an agent's skills directory.
///
/// Adoption and stranded-target repair legitimately write over an existing
/// real directory that has no `skill_targets` row — that directory is the very
/// thing the user asked us to take over. Ordinary deployment must never do
/// that, so the two intents cannot share a code path (#363).
#[derive(Debug, Clone, Copy)]
pub enum DeployIntent<'a> {
    /// Ordinary deployment: replace only what our own records vouch for.
    Managed,
    /// The user explicitly asked us to take over this scanned skill path.
    AdoptExisting(&'a Path),
}

/// Re-point every `source_ref` that names `target` at the referring skill's own
/// central copy, ahead of an adoption that replaces `target` with a managed
/// deployment (#425).
///
/// An adopted directory stops being an independent copy the moment the
/// adoption runs: it becomes a link to (or copy of) central that can be
/// removed at any time — by the agent's own skill management cleaning up what
/// it does not recognize, or by a later undeploy. A skill whose `source_ref`
/// still names that directory then fails its update check with
/// `source_missing` forever, even though the central copy is intact.
///
/// The central copy always exists while the skill row does, so re-pointing
/// keeps the source resolvable; the content-hash comparison against it keeps
/// reporting `up_to_date`. Matching is by exact string or canonicalized path,
/// because import records can spell the same directory with mixed separators
/// than the deployment target computed from the adapter.
pub(crate) fn detach_source_refs_from_adoption_target(
    store: &SkillStore,
    target: &Path,
) -> Result<(), AppError> {
    let target_str = target.to_string_lossy().into_owned();
    // `canonicalize` resolves through symlinks, but a symlinked target is only
    // unlinked by the replacement below (`remove_classified_target` treats
    // LinkToSource/ForeignLink as `remove_link`) -- whatever it pointed at
    // survives untouched. Resolving through the link would re-point the
    // source_ref of a directory that is still on disk and still the user's
    // source of truth, and the update check would then compare central to
    // itself forever. An exact string match still applies: if the source_ref
    // *is* the link path, that link really is going away.
    let target_canonical = if std::fs::symlink_metadata(target)
        .map(|meta| meta.file_type().is_symlink())
        .unwrap_or(false)
    {
        None
    } else {
        std::fs::canonicalize(target).ok()
    };
    for skill in store.get_all_skills().map_err(AppError::db)? {
        let Some(source_ref) = skill.source_ref.as_deref() else {
            continue;
        };
        // Already re-pointed by a previous adoption — nothing to do.
        if source_ref == skill.central_path {
            continue;
        }
        let points_at_target = source_ref == target_str
            || target_canonical.as_ref().is_some_and(|canonical| {
                std::fs::canonicalize(source_ref).is_ok_and(|source| &source == canonical)
            });
        if points_at_target {
            store
                .update_skill_source_ref(&skill.id, &skill.central_path)
                .map_err(AppError::db)?;
            log::info!(
                "adoption: re-pointed source_ref of skill '{}' at its central copy; \
                 the adopted agent directory is now a deployment, not a source (#425)",
                skill.name
            );
        }
    }
    Ok(())
}

/// Deploy one skill; `force` requires explicit confirmation of replacement.
pub fn sync_single_skill_to_tool(
    store: &SkillStore,
    skill_id: &str,
    tool: &str,
    intent: DeployIntent<'_>,
    force: bool,
) -> Result<(), AppError> {
    let adapter = tool_adapters::find_adapter_with_store(store, tool)
        .ok_or_else(|| AppError::not_found(format!("Unknown tool: {}", tool)))?;

    if !adapter.can_deploy() {
        return Err(AppError::not_found(format!(
            "{} is not installed",
            adapter.display_name
        )));
    }

    if tool_service::get_disabled_tools(store).contains(&tool.to_string()) {
        return Err(AppError::invalid_input(format!(
            "{} is disabled",
            adapter.display_name
        )));
    }

    let skill = store
        .get_skill_by_id(skill_id)
        .map_err(AppError::db)?
        .ok_or_else(|| AppError::not_found("Skill not found"))?;

    let source = PathBuf::from(&skill.central_path);
    let existing_targets = store
        .get_targets_for_skill(skill_id)
        .map_err(AppError::db)?;
    let target = match intent {
        DeployIntent::AdoptExisting(path) => {
            let root = adapter.skills_dir();
            if !is_skill_path_within_root(path, &root) {
                return Err(AppError::invalid_input(
                    "Skill path is outside the agent skills directory",
                ));
            }
            path.to_path_buf()
        }
        DeployIntent::Managed => deployment_target(
            &adapter,
            &sync_engine::target_dir_name(&source, &skill.name),
            skill_id,
            &existing_targets,
        ),
    };
    let configured_mode = store.get_setting("sync_mode").map_err(AppError::db)?;
    let mode = sync_engine::sync_mode_for_tool(tool, configured_mode.as_deref());
    let recorded_mode = match intent {
        DeployIntent::AdoptExisting(_) => None,
        DeployIntent::Managed => existing_targets
            .iter()
            .find(|existing| {
                existing.tool == tool && std::path::Path::new(&existing.target_path) == target
            })
            .map(|existing| existing.mode.clone()),
    };
    let policy = match intent {
        DeployIntent::AdoptExisting(_) => sync_engine::ReplacePolicy::UserConfirmed,
        DeployIntent::Managed => replace_policy(recorded_mode.as_deref(), force),
    };
    if matches!(policy, sync_engine::ReplacePolicy::UserConfirmed) {
        // The directory at `target` may still be the import source of the very
        // skill being deployed (or of a sibling record): re-point those at
        // central BEFORE the replacement, so a failure partway through the
        // replacement can never leave a dangling source behind (#425).
        detach_source_refs_from_adoption_target(store, &target)?;
    }
    let actual_mode = sync_engine::sync_skill(&source, &target, mode, policy).map_err(|e| {
        if let Some(refused) = e.downcast_ref::<sync_engine::ReplaceRefused>() {
            AppError::target_conflict(
                refused.to_string(),
                vec![TargetConflictDetail {
                    path: refused.target.to_string_lossy().to_string(),
                    reason: refused.reason.to_string(),
                    is_skill: skill_metadata::is_valid_skill_dir(&refused.target),
                }],
            )
        } else {
            AppError::io(e)
        }
    })?;

    let now = chrono::Utc::now().timestamp_millis();
    let target_record = SkillTargetRecord {
        id: uuid::Uuid::new_v4().to_string(),
        skill_id: skill_id.to_string(),
        tool: tool.to_string(),
        target_path: target.to_string_lossy().to_string(),
        mode: actual_mode.as_str().to_string(),
        status: "ok".to_string(),
        synced_at: Some(now),
        last_error: None,
        source_hash: skill.content_hash.clone(),
    };

    store.insert_target(&target_record).map_err(AppError::db)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::{error::ErrorKind, skill_store::SkillRecord};
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn ordinary_deployment_preserves_foreign_skill_and_force_repairs_source_reference() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let source = tmp.path().join("library/demo");
        let root = tmp.path().join("agent-skills");
        let target = root.join("demo");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("SKILL.md"), "Library content").unwrap();
        fs::write(target.join("SKILL.md"), "Existing content").unwrap();
        store.set_setting("sync_mode", "copy").unwrap();
        store
            .set_setting(
                "custom_tools",
                &serde_json::json!([{
                    "key": "test_agent",
                    "display_name": "Test Agent",
                    "skills_dir": root.to_string_lossy(),
                }])
                .to_string(),
            )
            .unwrap();
        let skill = SkillRecord {
            id: "demo".into(),
            name: "demo".into(),
            description: None,
            source_type: "local".into(),
            source_ref: Some(target.to_string_lossy().into_owned()),
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            source_agent: None,
            remote_revision: None,
            central_path: source.to_string_lossy().into_owned(),
            content_hash: None,
            enabled: true,
            created_at: 1,
            updated_at: 1,
            status: "ok".into(),
            update_status: "local_only".into(),
            last_checked_at: None,
            last_check_error: None,
        };
        store.insert_skill(&skill).unwrap();

        let error =
            sync_single_skill_to_tool(&store, "demo", "test_agent", DeployIntent::Managed, false)
                .unwrap_err();
        assert_eq!(error.kind, ErrorKind::TargetConflict);
        let conflicts = error.details.unwrap().conflicts;
        assert_eq!(conflicts.len(), 1);
        assert_eq!(Path::new(&conflicts[0].path), target);
        assert!(conflicts[0].is_skill);
        assert_eq!(
            fs::read_to_string(target.join("SKILL.md")).unwrap(),
            "Existing content"
        );
        assert!(store.get_targets_for_skill("demo").unwrap().is_empty());
        assert_eq!(
            store.get_skill_by_id("demo").unwrap().unwrap().source_ref,
            skill.source_ref
        );

        sync_single_skill_to_tool(&store, "demo", "test_agent", DeployIntent::Managed, true)
            .unwrap();
        assert_eq!(
            fs::read_to_string(target.join("SKILL.md")).unwrap(),
            "Library content"
        );
        assert_eq!(store.get_targets_for_skill("demo").unwrap().len(), 1);
        assert_eq!(
            store.get_skill_by_id("demo").unwrap().unwrap().source_ref,
            Some(skill.central_path)
        );
    }

    #[test]
    fn unknown_tool_is_not_reported_as_a_target_conflict() {
        let tmp = tempdir().unwrap();
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let error = sync_single_skill_to_tool(
            &store,
            "missing",
            "unknown_agent",
            DeployIntent::Managed,
            false,
        )
        .unwrap_err();
        assert_eq!(error.kind, ErrorKind::NotFound);
        assert!(error.details.is_none());
    }
}
