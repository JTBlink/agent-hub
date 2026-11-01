use super::*;

/// Outcome of a full sync transaction for the frontend.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SyncOutcome {
    /// Local changes were committed as part of this sync.
    pub committed: bool,
    /// Merge result when a merge ran (None when nothing to pull).
    pub merge: Option<merge::MergeSummary>,
    pub pushed: bool,
    /// Snapshot tag on the pushed state (None when nothing was pushed).
    pub snapshot_tag: Option<String>,
}

const SYNC_PUSH_ATTEMPTS: usize = 3;

pub(super) fn run_sync_blocking(
    store: &SkillStore,
    skills_dir: &Path,
    message: &str,
) -> anyhow::Result<SyncOutcome> {
    apply_device_identity(store, skills_dir);

    // Local changes first — they must be safe before any network step.
    backup_workspace::write_metadata(store, skills_dir)?;
    // Rebuild the oversized exclusions BEFORE the dirty check: a previously
    // excluded skill that shrank below the limit re-enters the backup by
    // making .gitignore (and the skill itself) show up as changes.
    if let Err(e) =
        git_backup::apply_oversized_exclusions(skills_dir, git_backup::SKILL_SIZE_LIMIT_BYTES)
    {
        log::warn!("backup size: exclusion scan failed (continuing): {e:#}");
    }
    let mut committed = false;
    if git_backup::has_uncommitted_changes(skills_dir)? {
        git_backup::commit_all_unlocked(skills_dir, message)?;
        committed = true;
    }

    // The local commit is already safe. Only a new remote with no branch may
    // continue to its first push; failed authentication must stop here.
    let branch = git_backup::current_branch(skills_dir);
    if let Err(error) = git_backup::fetch_branch(skills_dir, &branch) {
        if !crate::core::git_failure::is_missing_remote_branch(&format!("{error:#}")) {
            return Err(error);
        }
    }

    let mut merge_summary: Option<merge::MergeSummary> = None;
    let mut pushed = false;
    let mut snapshot_tag: Option<String> = None;
    for attempt in 0..SYNC_PUSH_ATTEMPTS {
        let status = git_backup::get_status(skills_dir)?;
        if status.behind > 0 {
            let summary = merge::gated_pull_unlocked(store, skills_dir)?;
            backup_workspace::reconcile(store, skills_dir)?;
            merge_summary = Some(summary);
        }

        let status = git_backup::get_status(skills_dir)?;
        let needs_push = committed || status.ahead > 0 || status.upstream_health == "no_upstream";
        if !needs_push {
            break;
        }
        // Reuses an existing tag on HEAD, so retries don't mint duplicates.
        snapshot_tag = Some(git_backup::create_snapshot_tag_unlocked(skills_dir)?);
        match git_backup::push_unlocked(skills_dir) {
            Ok(()) => {
                pushed = true;
                break;
            }
            Err(e) => {
                let msg = format!("{e:#}");
                let rejected = crate::core::git_failure::is_push_race(&msg);
                if !rejected || attempt + 1 == SYNC_PUSH_ATTEMPTS {
                    return Err(e);
                }
                log::info!(
                    "git sync: push rejected (attempt {}), refetching",
                    attempt + 1
                );
                git_backup::fetch_branch(skills_dir, &branch)?;
            }
        }
    }

    if pushed {
        // A successful sync also clears a lingering auto-backup failure card.
        let _ = store.set_setting(crate::core::auto_backup::SETTING_LAST_ERROR, "");
    }
    store.log_audit(
        crate::core::audit_log::AuditDraft::new("sync")
            .detail(format!(
                "committed={} merged={} pushed={}",
                committed,
                merge_summary.is_some(),
                pushed
            ))
            .ok(),
    );
    Ok(SyncOutcome {
        committed,
        merge: merge_summary,
        pushed,
        snapshot_tag,
    })
}

#[cfg(test)]
mod tests;
