use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::State;

use crate::commands::projects::{
    classify_sync_status, ensure_dir_within_root, ensure_safe_skill_relative_path,
    source_ref_matches_skill_path, ProjectSkillDocumentDto,
};
use crate::core::skill_store::{SkillRecord, SkillStore, SkillTargetRecord};
use crate::core::{
    content_hash, error::AppError, installer, project_scanner, scenario_service, sync_engine,
    tool_adapters, tool_service,
};

fn target_path_equals_skill(target_path: &str, skill_path: &str) -> bool {
    if target_path == skill_path {
        return true;
    }
    match (
        std::fs::canonicalize(target_path),
        std::fs::canonicalize(skill_path),
    ) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

fn adapter_for_agent(
    store: &SkillStore,
    agent: &str,
) -> Result<tool_adapters::ToolAdapter, AppError> {
    tool_adapters::all_tool_adapters(store)
        .into_iter()
        .find(|adapter| adapter.key == agent)
        .ok_or_else(|| AppError::not_found(format!("Unknown agent: {}", agent)))
}

fn read_agent_local_skills(
    adapter: &tool_adapters::ToolAdapter,
) -> Vec<project_scanner::ProjectSkillInfo> {
    project_scanner::read_linked_workspace_skills(
        &adapter.skills_dir(),
        None,
        &adapter.key,
        &adapter.display_name,
        adapter.recursive_scan,
    )
}

fn enrich_center_status(
    mut skills: Vec<project_scanner::ProjectSkillInfo>,
    all_managed: &[SkillRecord],
    all_targets: &[SkillTargetRecord],
    tags_map: &std::collections::HashMap<String, Vec<String>>,
) -> Vec<project_scanner::ProjectSkillInfo> {
    for skill in &mut skills {
        let matched = find_verified_center_match(skill, all_managed, all_targets);
        skill.in_center = matched.is_some();
        skill.center_skill_id = matched.map(|record| record.id.clone());
        skill.tags = skill
            .center_skill_id
            .as_ref()
            .and_then(|skill_id| tags_map.get(skill_id).cloned())
            .unwrap_or_default();
        skill.sync_status = classify_sync_status(skill, matched);
    }
    skills
}

fn find_agent_skill(
    adapter: &tool_adapters::ToolAdapter,
    skill_relative_path: &str,
) -> Result<project_scanner::ProjectSkillInfo, AppError> {
    ensure_safe_skill_relative_path(skill_relative_path)?;
    read_agent_local_skills(adapter)
        .into_iter()
        .find(|skill| skill.relative_path == skill_relative_path)
        .ok_or_else(|| AppError::not_found("Skill not found in agent local directory"))
}

fn ensure_agent_skill_path(path: &Path, skills_root: &Path) -> Result<(), AppError> {
    ensure_dir_within_root(path, skills_root)?;
    Ok(())
}

fn path_matches_skill_path(
    skill_path: &str,
    skill_canonical: Option<&PathBuf>,
    other: &str,
) -> bool {
    if other == skill_path {
        return true;
    }
    let Some(skill_canonical) = skill_canonical else {
        return false;
    };
    let Ok(other_canonical) = std::fs::canonicalize(other) else {
        return false;
    };
    other_canonical == *skill_canonical
}

fn target_matches_skill_path(
    target: &SkillTargetRecord,
    skill_path: &str,
    skill_canonical: Option<&PathBuf>,
) -> bool {
    path_matches_skill_path(skill_path, skill_canonical, &target.target_path)
}

fn find_verified_center_match<'a>(
    skill: &project_scanner::ProjectSkillInfo,
    all_managed: &'a [SkillRecord],
    all_targets: &[SkillTargetRecord],
) -> Option<&'a SkillRecord> {
    let skill_hash = skill.content_hash.as_deref();
    let canonical_skill_path = std::fs::canonicalize(&skill.path).ok();

    all_managed
        .iter()
        .filter_map(|managed| {
            if source_ref_matches_skill_path(&skill.path, canonical_skill_path.as_ref(), managed) {
                return Some((managed, 3));
            }
            if all_targets.iter().any(|target| {
                target.skill_id == managed.id
                    && target_matches_skill_path(target, &skill.path, canonical_skill_path.as_ref())
            }) {
                return Some((managed, 3));
            }
            if skill_hash.is_some() && managed.content_hash.as_deref() == skill_hash {
                return Some((managed, 2));
            }
            None
        })
        .max_by_key(|(_, score)| *score)
        .map(|(managed, _)| managed)
}

#[tauri::command]
pub async fn get_global_local_skills(
    store: State<'_, Arc<SkillStore>>,
    agent: String,
) -> Result<Vec<project_scanner::ProjectSkillInfo>, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let adapter = adapter_for_agent(&store, &agent)?;
        let skills = read_agent_local_skills(&adapter);
        let all_managed = store.get_all_skills().map_err(AppError::db)?;
        let all_targets = store.get_all_targets().map_err(AppError::db)?;
        let tags_map = store.get_tags_map().unwrap_or_default();
        Ok(enrich_center_status(
            skills,
            &all_managed,
            &all_targets,
            &tags_map,
        ))
    })
    .await?
}

#[tauri::command]
pub async fn get_global_local_skill_document(
    store: State<'_, Arc<SkillStore>>,
    agent: String,
    skill_relative_path: String,
) -> Result<ProjectSkillDocumentDto, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let adapter = adapter_for_agent(&store, &agent)?;
        ensure_safe_skill_relative_path(&skill_relative_path)?;

        let skills_root = adapter.skills_dir();
        let skill_dir = skills_root.join(&skill_relative_path);
        ensure_agent_skill_path(&skill_dir, &skills_root)?;

        let allowed_roots = [skills_root];
        let candidates = ["SKILL.md", "skill.md", "CLAUDE.md", "README.md"];
        for candidate in &candidates {
            let file_path = skill_dir.join(candidate);
            if !file_path.exists() {
                continue;
            }
            if let Ok(meta) = std::fs::symlink_metadata(&file_path) {
                if meta.file_type().is_symlink() {
                    let resolved = match std::fs::canonicalize(&file_path) {
                        Ok(path) => path,
                        Err(_) => continue,
                    };
                    let in_allowed_root = allowed_roots.iter().any(|root| {
                        std::fs::canonicalize(root)
                            .map(|canon| resolved.starts_with(&canon))
                            .unwrap_or(false)
                    });
                    if !in_allowed_root {
                        continue;
                    }
                }
            }
            if file_path.is_file() {
                let content = std::fs::read_to_string(&file_path)?;
                return Ok(ProjectSkillDocumentDto {
                    skill_name: skill_relative_path,
                    filename: candidate.to_string(),
                    content,
                });
            }
        }

        Err(AppError::not_found(
            "No document file found in skill directory",
        ))
    })
    .await?
}

#[tauri::command]
pub async fn import_global_local_skill_to_center(
    store: State<'_, Arc<SkillStore>>,
    agent: String,
    skill_relative_path: String,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        import_agent_local_skill_to_center(&store, &agent, &skill_relative_path)
    })
    .await?
}

fn import_agent_local_skill_to_center(
    store: &SkillStore,
    agent: &str,
    skill_relative_path: &str,
) -> Result<(), AppError> {
    let adapter = adapter_for_agent(store, agent)?;
    let skill = find_agent_skill(&adapter, skill_relative_path)?;

    let skills_root = adapter.skills_dir();
    let source_path = PathBuf::from(&skill.path);
    ensure_agent_skill_path(&source_path, &skills_root)?;

    let all_managed = store.get_all_skills().unwrap_or_default();
    let all_targets = store.get_all_targets().unwrap_or_default();
    if let Some(existing) = find_verified_center_match(&skill, &all_managed, &all_targets) {
        let result = installer::install_from_local_to_destination(
            &source_path,
            Some(&existing.name),
            Path::new(&existing.central_path),
        )
        .map_err(AppError::io)?;
        store
            .update_skill_after_install(
                &existing.id,
                &existing.name,
                result.description.as_deref(),
                existing.source_revision.as_deref(),
                existing.remote_revision.as_deref(),
                Some(&result.content_hash),
                "local_only",
            )
            .map_err(AppError::db)?;

        let already_matched_by_ref = source_ref_matches_skill_path(
            &skill.path,
            std::fs::canonicalize(&skill.path).ok().as_ref(),
            existing,
        );
        if existing.source_type == "local" && already_matched_by_ref {
            store
                .update_skill_source_ref(&existing.id, &skill.path)
                .map_err(AppError::db)?;
        }

        // Register this agent as a managed sync target so the adopted skill is
        // recognized as managed (gives it a delete button). Reusing the regular
        // sync path keeps the target consistent with every other managed skill:
        // sync_engine owns the on-disk artifact, so later unsync/scenario-sync
        // touch only that managed artifact, never the user's source.
        // AdoptExisting: the directory being replaced is the very one the user
        // asked us to take over, and it has no target row yet (#363).
        scenario_service::sync_single_skill_to_tool(
            store,
            &existing.id,
            agent,
            scenario_service::DeployIntent::AdoptExisting(&source_path),
            false,
        )?;
        return Ok(());
    }

    let result =
        installer::install_from_local(&source_path, Some(&skill.name)).map_err(AppError::io)?;
    let now = chrono::Utc::now().timestamp_millis();
    let id = uuid::Uuid::new_v4().to_string();
    let skill_record = SkillRecord {
        id,
        name: result.name.clone(),
        description: result.description.clone(),
        source_type: "local".to_string(),
        source_ref: Some(skill.path.clone()),
        source_ref_resolved: None,
        source_subpath: None,
        source_branch: None,
        source_revision: None,
        source_agent: Some(agent.to_string()),
        remote_revision: None,
        central_path: result.central_path.to_string_lossy().to_string(),
        content_hash: Some(result.content_hash.clone()),
        enabled: true,
        created_at: now,
        updated_at: now,
        status: "ok".to_string(),
        update_status: "local_only".to_string(),
        last_checked_at: Some(now),
        last_check_error: None,
    };

    store.insert_skill(&skill_record).map_err(AppError::db)?;
    // Register the managed sync target (see note above). On failure, drop the
    // just-inserted skill row (which cascades to any target) so we never leave
    // an orphaned, button-less skill behind. We deliberately do NOT delete the
    // central directory: `install_from_local` may have de-duplicated onto a
    // directory shared with another skill, and removing it could corrupt that
    // skill — an orphaned dir is harmless by comparison.
    if let Err(err) = scenario_service::sync_single_skill_to_tool(
        store,
        &skill_record.id,
        agent,
        scenario_service::DeployIntent::AdoptExisting(&source_path),
        false,
    ) {
        let _ = store.delete_skill(&skill_record.id);
        return Err(err);
    }
    Ok(())
}

/// Repair "stranded" center skills left behind by uploads that predate the
/// sync-target registration fix. Such a skill has a center record whose
/// `source_ref` still points at a skill living in an agent's skills directory,
/// but no `skill_targets` row for that agent — so the global workspace treats
/// it as in-sync-but-unmanaged and renders no actions (the missing delete
/// button). Runs once at startup; idempotent (after repair the target exists,
/// so later runs find nothing and exit on the cheap pre-check).
///
/// We match strictly by `source_ref` — the strong "this skill was uploaded
/// FROM here" signal — never by content hash, which could silently adopt a
/// look-alike skill the user never uploaded. We also only repair skills whose
/// on-disk content still equals the center copy (hash match): completing the
/// registration runs `sync_single_skill_to_tool`, which rewrites the agent
/// artifact from the central copy, so acting on a diverged skill could clobber
/// newer local edits. Diverged stranded skills are left for an explicit user
/// action. Best-effort: per-skill failures are logged and skipped.
/// Settings key holding the signature of the stranded-candidate set we last
/// attempted to backfill. See [`backfill_stranded_agent_targets`] for why.
const BACKFILL_SIG_KEY: &str = "backfill_stranded_candidates_sig";

/// Change detector for one candidate's on-disk state: the same content hash
/// the repair itself compares (which ignores junk like `.DS_Store`, so noise
/// can't churn the gate), plus an existence marker since `hash_directory`
/// hashes a missing dir like an empty one. Candidates are few, so hashing
/// just their dirs costs ~ms — nothing like the full scan-and-hash of every
/// agent the gate exists to avoid. The gate then re-arms exactly when a
/// candidate's repair inputs changed.
fn dir_content_fingerprint(path: &str) -> String {
    if !Path::new(path).exists() {
        return "missing".to_string();
    }
    content_hash::hash_directory(Path::new(path)).unwrap_or_else(|_| "unreadable".to_string())
}

/// Signature of the current stranded set: skills carrying a non-empty
/// `source_ref` but no target row. Returns `None` when the set is empty (there
/// is nothing to repair). The signature is order-independent (ids are sorted)
/// so it reflects the *set*, not the DB row order.
///
/// Beyond the candidate identities it folds in everything cheap that changes
/// whether a candidate is repairable, so the gate re-arms when repair might
/// newly succeed — not only when the set itself changes: the available
/// (installed + enabled) adapter keys, each candidate's DB content hash, and
/// content fingerprints of its local and central dirs (a diverged local
/// restored to match center, or center edited to match the local, must
/// re-arm).
fn stranded_candidate_signature(
    all_managed: &[SkillRecord],
    all_targets: &[SkillTargetRecord],
    available_tools: &[String],
) -> Option<String> {
    use sha2::{Digest, Sha256};
    use std::collections::HashSet;

    let targeted_skill_ids: HashSet<&str> =
        all_targets.iter().map(|t| t.skill_id.as_str()).collect();
    let mut candidates: Vec<(&str, &str, &str, &str)> = all_managed
        .iter()
        .filter_map(|managed| {
            let source_ref = managed.source_ref.as_deref().filter(|s| !s.is_empty())?;
            if targeted_skill_ids.contains(managed.id.as_str()) {
                return None;
            }
            Some((
                managed.id.as_str(),
                source_ref,
                managed.content_hash.as_deref().unwrap_or(""),
                managed.central_path.as_str(),
            ))
        })
        .collect();
    if candidates.is_empty() {
        return None;
    }
    candidates.sort_unstable();

    let mut tools: Vec<&str> = available_tools.iter().map(String::as_str).collect();
    tools.sort_unstable();

    let mut hasher = Sha256::new();
    for tool in tools {
        hasher.update(tool.as_bytes());
        hasher.update([0]);
    }
    hasher.update([0xfe]);
    for (id, source_ref, db_hash, central_path) in candidates {
        hasher.update(id.as_bytes());
        hasher.update([0]);
        hasher.update(source_ref.as_bytes());
        hasher.update([0]);
        hasher.update(db_hash.as_bytes());
        for path in [source_ref, central_path] {
            hasher.update([0]);
            hasher.update(dir_content_fingerprint(path).as_bytes());
        }
        hasher.update([0xff]);
    }
    Some(hex::encode(hasher.finalize()))
}

pub fn backfill_stranded_agent_targets(store: &SkillStore) -> usize {
    let all_managed = store.get_all_skills().unwrap_or_default();
    let all_targets = store.get_all_targets().unwrap_or_default();

    let disabled = tool_service::get_disabled_tools(store);
    let adapters = tool_adapters::all_tool_adapters(store);
    let available_tools: Vec<String> = adapters
        .iter()
        .filter(|adapter| adapter.can_deploy() && !disabled.contains(&adapter.key))
        .map(|adapter| adapter.key.clone())
        .collect();

    // Cheap in-memory pre-check: a stranded skill carries a `source_ref` but has
    // no target row. When nothing is stranded there is nothing to repair, so we
    // skip the filesystem scan entirely.
    let Some(signature) =
        stranded_candidate_signature(&all_managed, &all_targets, &available_tools)
    else {
        return 0;
    };

    // Second gate (#248): the scan below reads and hashes every agent's local
    // skills - ~8s on real libraries. Some candidates can never be repaired
    // (diverged locals we intentionally skip, or skills with no matching local
    // file), so `has_candidate` alone stayed true forever and re-ran the full
    // scan on EVERY launch. Skip when the stranded set is byte-identical to the
    // one we already attempted; a newly-stranded skill, a newly available
    // adapter, or an on-disk change to a candidate (see the signature docs)
    // re-arms the scan.
    if store
        .get_setting(BACKFILL_SIG_KEY)
        .ok()
        .flatten()
        .as_deref()
        == Some(signature.as_str())
    {
        return 0;
    }

    let mut repaired = 0usize;

    for adapter in &adapters {
        if !adapter.can_deploy() || disabled.contains(&adapter.key) {
            continue;
        }
        let targets = store.get_all_targets().unwrap_or_default();

        for skill in read_agent_local_skills(adapter) {
            let canonical = std::fs::canonicalize(&skill.path).ok();
            let Some(matched) = all_managed.iter().find(|managed| {
                source_ref_matches_skill_path(&skill.path, canonical.as_ref(), managed)
            }) else {
                continue;
            };

            if targets
                .iter()
                .any(|t| t.skill_id == matched.id && t.tool == adapter.key)
            {
                continue;
            }

            // Only safe when the local copy still equals center: the sync below
            // rewrites the agent artifact from central, so a diverged local would
            // lose its newer edits. Reuse the workspace's own classifier (which
            // also recomputes the live center hash when the DB hash is stale) so
            // we repair exactly the skills the UI shows as in-sync, no more.
            if classify_sync_status(&skill, Some(matched)) != "in_sync" {
                log::info!(
                    "backfill: skipping diverged stranded skill '{}' on agent '{}' (needs manual action)",
                    matched.name,
                    adapter.key
                );
                continue;
            }

            // The scan snapshot above can be seconds old on a large library, and
            // we now run concurrently with the user (post-#248 the backfill is
            // off the setup path). Re-hash both sides of THIS skill immediately
            // before writing so an edit made since the scan is never clobbered
            // by the central copy. One dir each — cheap. Explicit existence
            // checks because hash_directory treats a missing dir like an empty
            // one instead of failing.
            let local_path = Path::new(&skill.path);
            let center_path = Path::new(&matched.central_path);
            let fresh_match = local_path.exists()
                && center_path.exists()
                && match (
                    content_hash::hash_directory(local_path),
                    content_hash::hash_directory(center_path),
                ) {
                    (Ok(local), Ok(center)) => local == center,
                    // Fail closed: if either side can't be read, don't write.
                    _ => false,
                };
            if !fresh_match {
                log::info!(
                    "backfill: skipping stranded skill '{}' on agent '{}': content changed since scan",
                    matched.name,
                    adapter.key
                );
                continue;
            }

            // AdoptExisting: this repairs a target row that was never written,
            // so no record vouches for the directory. The hash equality check
            // above is what makes overwriting it safe.
            match scenario_service::sync_single_skill_to_tool(
                store,
                &matched.id,
                &adapter.key,
                scenario_service::DeployIntent::AdoptExisting(local_path),
                false,
            ) {
                Ok(()) => {
                    repaired += 1;
                    log::info!(
                        "backfill: registered missing sync target for stranded skill '{}' on agent '{}'",
                        matched.name,
                        adapter.key
                    );
                }
                Err(err) => log::warn!(
                    "backfill: failed to repair stranded skill '{}' on agent '{}': {}",
                    matched.name,
                    adapter.key,
                    err
                ),
            }
        }
    }

    if repaired > 0 {
        log::info!("backfill: repaired {repaired} stranded agent skill target(s)");
    }

    // Record the stranded set that remains AFTER repairing so an unchanged set
    // won't trigger the expensive scan again next launch. Recomputed from fresh
    // targets (repairs above added rows) so it converges in a single launch:
    // repaired skills drop out, and only the genuinely un-repairable ones seed
    // the gate. Best-effort: a failed write just means we re-scan next time.
    let post_targets = store.get_all_targets().unwrap_or_default();
    match stranded_candidate_signature(&all_managed, &post_targets, &available_tools) {
        Some(remaining_sig) => {
            let _ = store.set_setting(BACKFILL_SIG_KEY, &remaining_sig);
        }
        // Everything got repaired: clear the gate so a future stranded skill is
        // never masked by a stale signature.
        None => {
            let _ = store.set_setting(BACKFILL_SIG_KEY, "");
        }
    }

    repaired
}

#[tauri::command]
pub async fn update_global_local_skill_from_center(
    store: State<'_, Arc<SkillStore>>,
    agent: String,
    skill_relative_path: String,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        update_agent_local_skill_from_center(&store, &agent, &skill_relative_path)
    })
    .await?
}

fn update_agent_local_skill_from_center(
    store: &SkillStore,
    agent: &str,
    skill_relative_path: &str,
) -> Result<(), AppError> {
    let adapter = adapter_for_agent(store, agent)?;
    let skill = find_agent_skill(&adapter, skill_relative_path)?;
    let all_managed = store.get_all_skills().unwrap_or_default();
    let all_targets = store.get_all_targets().unwrap_or_default();
    let managed = find_verified_center_match(&skill, &all_managed, &all_targets)
        .ok_or_else(|| AppError::not_found("No matching managed skill in center"))?;

    if classify_sync_status(&skill, Some(managed)) == "project_newer" {
        return Err(AppError::invalid_input(
            "Local skill is newer than the Skills Center version",
        ));
    }

    let skills_root = adapter.skills_dir();
    let target_path = PathBuf::from(&skill.path);
    ensure_agent_skill_path(&target_path, &skills_root)?;

    let source = PathBuf::from(&managed.central_path);
    let preference = crate::core::deployment_preferences::Preference::load(
        store,
        crate::core::deployment_preferences::Scope::Global,
    )?;
    let mode = preference.for_target(Some(if target_path.is_symlink() {
        "symlink"
    } else {
        "copy"
    }));
    // The replacement below turns the agent's real directory into a deployment
    // of central; any source_ref naming it must be re-pointed first, exactly
    // like an adoption (#425).
    scenario_service::detach_source_refs_from_adoption_target(store, Path::new(&target_path))?;
    // UserConfirmed: an explicit "update this agent copy from center" on a
    // skill the user picked, already guarded by the project_newer check above.
    // The target is a discovered agent skill dir, which carries no target row.
    sync_engine::sync_skill(
        &source,
        &target_path,
        mode,
        sync_engine::ReplacePolicy::UserConfirmed,
    )
    .map_err(AppError::io)?;
    Ok(())
}

#[tauri::command]
pub async fn delete_global_local_skill(
    store: State<'_, Arc<SkillStore>>,
    agent: String,
    skill_relative_path: String,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        delete_agent_local_skill(&store, &agent, &skill_relative_path)
    })
    .await?
}

fn delete_agent_local_skill(
    store: &SkillStore,
    agent: &str,
    skill_relative_path: &str,
) -> Result<(), AppError> {
    let adapter = adapter_for_agent(store, agent)?;
    let skill = find_agent_skill(&adapter, skill_relative_path)?;

    let all_managed = store.get_all_skills().unwrap_or_default();
    let all_targets = store.get_all_targets().unwrap_or_default();
    if let Some(managed) = find_verified_center_match(&skill, &all_managed, &all_targets) {
        let still_linked = all_targets.iter().any(|t| {
            t.skill_id == managed.id && target_path_equals_skill(&t.target_path, &skill.path)
        });
        if still_linked {
            return Err(AppError::invalid_input(
                "Skill is managed by Skills Center — remove from the agent first.",
            ));
        }
    }

    let skills_root = adapter.skills_dir();
    let target_path = PathBuf::from(&skill.path);
    ensure_agent_skill_path(&target_path, &skills_root)?;
    sync_engine::remove_target(&target_path).map_err(AppError::io)?;
    Ok(())
}

#[cfg(test)]
mod tests;
