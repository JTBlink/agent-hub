mod sync_transaction;
use sync_transaction::run_sync_blocking;
pub use sync_transaction::SyncOutcome;

use crate::core::{
    backup_workspace, central_repo, error::AppError, git2_engine, git_backup, git_credentials,
    git_fetcher, merge, sync_metadata,
};
use anyhow::Context;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::State;

use crate::core::skill_store::SkillStore;

static FETCH_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

/// Classify a git failure keeping the full anyhow cause chain: the top-level
/// context alone ("object merge aborted…") hides the actual reason (e.g.
/// which validation rule failed), which is what the failure card must show.
pub(crate) fn classify_git_chain(e: anyhow::Error) -> AppError {
    AppError::classify_git_error(format!("{e:#}"))
}

/// Push the persisted engine choice (`git_backup_engine` = "git2" | "system")
/// and proxy setting into the core layer, which has no store access. Called
/// at the entry of every command that can touch the network.
pub(crate) fn sync_engine_pref(store: &SkillStore) {
    let git2_enabled = store
        .get_setting("git_backup_engine")
        .ok()
        .flatten()
        .map(|v| v.trim() == "git2")
        .unwrap_or(false);
    git2_engine::set_preference(git2_enabled, store.proxy_url());
}

/// Resolve the device name (§4.3 设备命名): the persisted setting, or a
/// hostname-derived default that is persisted on first use so it stays stable
/// across sessions.
fn effective_device_name(store: &SkillStore) -> String {
    let saved = store
        .get_setting("backup_device_name")
        .ok()
        .flatten()
        .map(|v| git_backup::sanitize_device_name(&v))
        .filter(|v| !v.is_empty());
    if let Some(name) = saved {
        return name;
    }
    let name = git_backup::default_device_name();
    if let Err(e) = store.set_setting("backup_device_name", &name) {
        log::warn!("device name: failed to persist default: {e:#}");
    }
    name
}

/// Best-effort: bring the repo's commit identity in line with the device name
/// before an operation that can create commits. Identity trouble must never
/// block a backup — commits then just carry the previous (or global) author.
pub(crate) fn apply_device_identity(store: &SkillStore, skills_dir: &Path) {
    let name = effective_device_name(store);
    if let Err(e) = git_backup::configure_device_identity(skills_dir, &name) {
        log::warn!("device name: failed to configure git identity: {e:#}");
    }
}

/// RAII guard that clears `FETCH_IN_FLIGHT` on drop. Survives future
/// cancellation, panic in the blocking task, and early returns — without
/// it, a dropped command future would strand the flag set forever.
struct FetchInFlightGuard;

impl FetchInFlightGuard {
    fn try_acquire() -> Option<Self> {
        FETCH_IN_FLIGHT
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .ok()
            .map(|_| FetchInFlightGuard)
    }
}

impl Drop for FetchInFlightGuard {
    fn drop(&mut self) {
        FETCH_IN_FLIGHT.store(false, Ordering::Release);
    }
}

#[tauri::command]
pub async fn git_backup_fetch(store: State<'_, Arc<SkillStore>>) -> Result<(), AppError> {
    sync_engine_pref(&store);
    // Coalesce concurrent fetches: a `git fetch` against the central repo
    // already in flight makes any duplicate request redundant, and stacking
    // them up holds open ssh connections to GitHub.
    let Some(_guard) = FetchInFlightGuard::try_acquire() else {
        return Ok(());
    };
    let skills_dir = backup_workspace::repo_dir();
    tokio::task::spawn_blocking(move || {
        git_backup::fetch_remote(&skills_dir).map_err(AppError::git)
    })
    .await?
}

#[tauri::command]
pub async fn git_backup_status(
    store: State<'_, Arc<SkillStore>>,
) -> Result<git_backup::GitBackupStatus, AppError> {
    let store = store.inner().clone();
    tokio::task::spawn_blocking(move || backup_workspace::status(&store).map_err(AppError::git))
        .await?
}

#[tauri::command]
pub async fn git_backup_file_diff(path: String) -> Result<git_backup::GitBackupFileDiff, AppError> {
    tokio::task::spawn_blocking(move || backup_workspace::file_diff(&path).map_err(AppError::git))
        .await?
}

#[tauri::command]
pub async fn git_backup_init(store: State<'_, Arc<SkillStore>>) -> Result<(), AppError> {
    let store = store.inner().clone();
    tokio::task::spawn_blocking(move || {
        backup_workspace::run(&store, "git init", |skills_dir| {
            backup_workspace::write_metadata(&store, skills_dir)?;
            git_backup::init_repo_unlocked(skills_dir, &effective_device_name(&store))
        })
        .map_err(AppError::git)
    })
    .await?
}

/// Persist embedded URL credentials before returning a sanitized URL. A failed
/// save is surfaced, never worked around by persisting a secret-bearing URL.
fn sanitize_url_to_store(url: &str) -> Result<String, AppError> {
    let Some((cred, sanitized)) = git_credentials::split_credentials_from_url(url) else {
        return Ok(url.to_string());
    };
    let host = git_credentials::https_host(&sanitized)
        .ok_or_else(|| AppError::invalid_input("Invalid credential host"))?;
    git_credentials::store_credential(&host, &cred)
        .map_err(|e| AppError::internal(format!("CREDENTIAL_STORE_UNAVAILABLE: {e:#}")))?;
    Ok(sanitized)
}

/// Sanitize a remote URL before it is persisted anywhere: embedded
/// credentials go to the local credential store, the returned URL is what the frontend
/// must save and display.
#[tauri::command]
pub async fn git_backup_sanitize_remote_url(url: String) -> Result<String, AppError> {
    git_fetcher::validate_git_url(&url).map_err(AppError::git)?;
    tokio::task::spawn_blocking(move || sanitize_url_to_store(url.trim())).await?
}

#[tauri::command]
pub async fn git_backup_set_remote(
    store: State<'_, Arc<SkillStore>>,
    url: String,
) -> Result<String, AppError> {
    sync_engine_pref(&store);
    git_fetcher::validate_git_url(&url).map_err(AppError::git)?;
    let skills_dir = backup_workspace::repo_dir();
    tokio::task::spawn_blocking(move || {
        let effective = sanitize_url_to_store(url.trim())?;
        git_backup::set_remote(&skills_dir, &effective).map_err(classify_git_chain)?;
        Ok(effective)
    })
    .await?
}

/// Disconnect the local machine from the backup remote (#260, §3.1 断开本机):
/// remove the git origin, clear the saved remote URL setting, and delete the
/// machine's stored access credential. Remote repository data and the local
/// repo are kept; other devices are unaffected.
#[tauri::command]
pub async fn git_backup_remove_remote(store: State<'_, Arc<SkillStore>>) -> Result<(), AppError> {
    let store = store.inner().clone();
    let skills_dir = backup_workspace::repo_dir();
    tokio::task::spawn_blocking(move || disconnect_local(&store, &skills_dir)).await?
}

fn disconnect_local(store: &SkillStore, skills_dir: &Path) -> Result<(), AppError> {
    // Collect credential hosts before the URLs are gone.
    let mut hosts = std::collections::HashSet::new();
    if let Some(url) = git_backup::raw_remote_url(skills_dir) {
        hosts.extend(git_credentials::https_host(&url));
    }
    if let Ok(Some(url)) = store.get_setting("git_backup_remote_url") {
        hosts.extend(git_credentials::https_host(&url));
    }

    git_backup::remove_remote(skills_dir).map_err(AppError::git)?;
    store
        .set_setting("git_backup_remote_url", "")
        .map_err(AppError::db)?;
    let _ = store.set_setting("github_auth_method", "");

    for host in hosts {
        if let Err(e) = git_credentials::delete_credential(&host) {
            log::warn!("git disconnect: failed to delete local credential: {e:#}");
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn git_backup_commit(
    store: State<'_, Arc<SkillStore>>,
    message: String,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tokio::task::spawn_blocking(move || {
        backup_workspace::run(&store, "git commit", |skills_dir| {
            apply_device_identity(&store, skills_dir);
            backup_workspace::write_metadata(&store, skills_dir)?;
            git_backup::commit_all_unlocked(skills_dir, &message)
        })
        .map_err(AppError::git)
    })
    .await?
}

#[tauri::command]
pub async fn git_backup_push(store: State<'_, Arc<SkillStore>>) -> Result<(), AppError> {
    sync_engine_pref(&store);
    let store = store.inner().clone();
    let skills_dir = backup_workspace::repo_dir();
    tokio::task::spawn_blocking(move || {
        git_backup::push(&skills_dir).map_err(classify_git_chain)?;
        // A successful manual push also resolves any lingering auto-backup
        // failure — the persistent failure card must not outlive the problem.
        let _ = store.set_setting(crate::core::auto_backup::SETTING_LAST_ERROR, "");
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn git_backup_pull(
    store: State<'_, Arc<SkillStore>>,
) -> Result<merge::MergeSummary, AppError> {
    let store = store.inner().clone();
    sync_engine_pref(&store);
    tokio::task::spawn_blocking(move || {
        backup_workspace::run(&store, "git pull", |skills_dir| {
            // Merge commits must carry this device's identity too.
            apply_device_identity(&store, skills_dir);
            // Object merge by default since 3d-β; merge_engine=system is the
            // escape hatch back to the line-level git merge.
            let summary = merge::gated_pull_unlocked(&store, skills_dir)?;
            backup_workspace::reconcile(&store, skills_dir)?;
            store.log_audit(
                crate::core::audit_log::AuditDraft::new("sync_merge")
                    .detail(format!(
                        "engine={} updated={} kept_local={} conflicts={} pending={}",
                        summary.engine,
                        summary.updated.len(),
                        summary.kept_local.len(),
                        summary.new_conflicts.len(),
                        summary.pending_total
                    ))
                    .ok(),
            );
            Ok(summary)
        })
        .map_err(classify_git_chain)
    })
    .await?
}

/// Full backup sync as one transaction under a single repo lock (merge-engine
/// design §9 并发收敛): commit → fetch/merge → snapshot → push, retrying the
/// fetch/merge/push tail when another device pushes concurrently. Replaces
/// the frontend-orchestrated commit/pull/push sequence, whose lock gaps let a
/// benign race surface as a non-fast-forward "needs recovery" error.
#[tauri::command]
pub async fn git_backup_sync(
    store: State<'_, Arc<SkillStore>>,
    message: String,
) -> Result<SyncOutcome, AppError> {
    let store = store.inner().clone();
    sync_engine_pref(&store);
    tokio::task::spawn_blocking(move || {
        backup_workspace::run(&store, "git sync", |skills_dir| {
            run_sync_blocking(&store, skills_dir, &message)
        })
        .map_err(classify_git_chain)
    })
    .await?
}

/// Pending "needs attention" conflicts (merge-engine design §4) for the
/// Backup page. Reads the rebuildable SQLite projection.
#[tauri::command]
pub async fn git_backup_pending_conflicts(
    store: State<'_, Arc<SkillStore>>,
) -> Result<Vec<crate::core::skill_store::PendingConflictRow>, AppError> {
    let store = store.inner().clone();
    tokio::task::spawn_blocking(move || store.list_pending_conflicts().map_err(AppError::db))
        .await?
}

/// Resolve one pending conflict (§4 解决动作): action is one of
/// "keep_local" | "use_remote" | "keep_both". Returns the safety snapshot
/// tag taken before the resolution.
#[tauri::command]
pub async fn git_backup_resolve_conflict(
    store: State<'_, Arc<SkillStore>>,
    skill_id: String,
    action: String,
) -> Result<String, AppError> {
    let Some(action) = merge::resolve::ResolveAction::parse(&action) else {
        return Err(AppError::invalid_input("Unknown resolve action"));
    };
    let store = store.inner().clone();
    tokio::task::spawn_blocking(move || {
        backup_workspace::run(&store, "resolve conflict", |skills_dir| {
            apply_device_identity(&store, skills_dir);
            let safety_tag =
                merge::resolve::resolve_conflict_unlocked(&store, skills_dir, &skill_id, action)?;
            backup_workspace::reconcile(&store, skills_dir)?;
            store.log_audit(
                crate::core::audit_log::AuditDraft::new("resolve_conflict")
                    .skill(skill_id.clone(), skill_id.clone())
                    .detail(format!("action={action:?}"))
                    .ok(),
            );
            Ok(safety_tag)
        })
        .map_err(classify_git_chain)
    })
    .await?
}

#[tauri::command]
pub async fn git_backup_clone(
    store: State<'_, Arc<SkillStore>>,
    url: String,
) -> Result<(), AppError> {
    git_fetcher::validate_git_url(&url).map_err(AppError::git)?;
    let store = store.inner().clone();
    sync_engine_pref(&store);
    tokio::task::spawn_blocking(move || {
        let effective = sanitize_url_to_store(url.trim())?;
        backup_workspace::run(&store, "git clone", |skills_dir| {
            backup_workspace::clone_unlocked(skills_dir, &effective)?;
            apply_device_identity(&store, skills_dir);
            Ok(())
        })
        .map_err(classify_git_chain)
    })
    .await?
}

/// Recovery: stage a fresh clone and retain the entire previous tree, including
/// Git history. Local-only entries are carried into the restored tree.
#[tauri::command]
pub async fn git_backup_reclone(
    store: State<'_, Arc<SkillStore>>,
    url: String,
) -> Result<(), AppError> {
    git_fetcher::validate_git_url(&url).map_err(AppError::git)?;
    let store = store.inner().clone();
    sync_engine_pref(&store);
    tokio::task::spawn_blocking(move || {
        let effective = sanitize_url_to_store(url.trim())?;
        backup_workspace::run(&store, "git reclone", |skills_dir| {
            backup_workspace::clone_unlocked(skills_dir, &effective)?;
            apply_device_identity(&store, skills_dir);
            Ok(())
        })
        .map_err(classify_git_chain)
    })
    .await?
}

#[tauri::command]
pub async fn git_backup_create_snapshot(
    store: State<'_, Arc<SkillStore>>,
) -> Result<String, AppError> {
    let _ = store;
    let skills_dir = backup_workspace::repo_dir();
    tokio::task::spawn_blocking(move || {
        git_backup::create_snapshot_tag(&skills_dir).map_err(AppError::git)
    })
    .await?
}

#[tauri::command]
pub async fn git_backup_list_versions(
    store: State<'_, Arc<SkillStore>>,
    limit: Option<u32>,
) -> Result<Vec<git_backup::GitBackupVersion>, AppError> {
    let _ = store;
    let skills_dir = backup_workspace::repo_dir();
    tokio::task::spawn_blocking(move || {
        git_backup::list_snapshot_versions(&skills_dir, limit.map(|v| v as usize))
            .map_err(AppError::git)
    })
    .await?
}

/// Restore a snapshot. Returns the safety-point tag that captured the
/// pre-restore state, so the UI can tell the user the restore is undoable.
#[tauri::command]
pub async fn git_backup_restore_version(
    store: State<'_, Arc<SkillStore>>,
    tag: String,
) -> Result<String, AppError> {
    let store = store.inner().clone();
    tokio::task::spawn_blocking(move || {
        backup_workspace::run(&store, "git restore snapshot", |skills_dir| {
            // The safety-point and restore commits are made by this device.
            apply_device_identity(&store, skills_dir);
            let safety_tag = git_backup::restore_snapshot_version_unlocked(skills_dir, &tag)?;
            backup_workspace::reconcile(&store, skills_dir)?;
            Ok(safety_tag)
        })
        .map_err(AppError::git)
    })
    .await?
}

/// Effective device name (§4.3 设备命名): the saved setting, or a persisted
/// hostname-derived default.
#[tauri::command]
pub async fn backup_device_name(store: State<'_, Arc<SkillStore>>) -> Result<String, AppError> {
    let store = store.inner().clone();
    tokio::task::spawn_blocking(move || Ok(effective_device_name(&store))).await?
}

/// Rename this device. Only affects backups made from now on — history keeps
/// the author it was written with. Returns the sanitized name actually saved.
#[tauri::command]
pub async fn backup_set_device_name(
    store: State<'_, Arc<SkillStore>>,
    name: String,
) -> Result<String, AppError> {
    let store = store.inner().clone();
    tokio::task::spawn_blocking(move || {
        let sanitized = git_backup::sanitize_device_name(&name);
        if sanitized.is_empty() {
            return Err(AppError::invalid_input("Device name is empty"));
        }
        store
            .set_setting("backup_device_name", &sanitized)
            .map_err(AppError::db)?;
        let skills_dir = backup_workspace::repo_dir();
        if let Err(e) = git_backup::configure_device_identity(&skills_dir, &sanitized) {
            log::warn!("device name: failed to configure git identity: {e:#}");
        }
        Ok(sanitized)
    })
    .await?
}

#[tauri::command]
pub async fn git_backup_size_report() -> Result<git_backup::BackupSizeReport, AppError> {
    let skills_dir = backup_workspace::repo_dir();
    tokio::task::spawn_blocking(move || git_backup::size_report(&skills_dir).map_err(AppError::io))
        .await?
}

/// Migrate credentials embedded in the remote URL (`user:token@host`) into
/// the local credential store (§3.7). Rewrites `.git/config` and the saved setting to
/// the credential-free URL, verifies authentication still works, and rolls
/// everything back on any failure — no half-migrated state. Returns the
/// sanitized URL when a migration happened, `None` when there was nothing to
/// migrate.
#[tauri::command]
pub async fn git_backup_migrate_credentials(
    store: State<'_, Arc<SkillStore>>,
) -> Result<Option<String>, AppError> {
    if !git_credentials::background_access_enabled() {
        log::info!(
            "git credentials: migration skipped for debug build; set AGENT_HUB_DEV_KEYCHAIN=1 to opt in"
        );
        return Ok(None);
    }
    let store = store.inner().clone();
    tokio::task::spawn_blocking(move || migrate_embedded_credentials(&store).map_err(AppError::git))
        .await?
}

pub fn migrate_embedded_credentials(store: &SkillStore) -> anyhow::Result<Option<String>> {
    sync_engine_pref(store);
    let skills_dir = backup_workspace::repo_dir();
    git_backup::with_repo_lock("git credential migration", || {
        migrate_embedded_credentials_unlocked(store, &skills_dir)
    })
}

fn migrate_embedded_credentials_unlocked(
    store: &SkillStore,
    skills_dir: &Path,
) -> anyhow::Result<Option<String>> {
    let has_embedded = |url: &String| git_credentials::split_credentials_from_url(url).is_some();

    let config_url = if skills_dir.join(".git").exists() {
        git_backup::raw_remote_url(skills_dir)
    } else {
        None
    };
    let setting_url = store
        .get_setting("git_backup_remote_url")
        .ok()
        .flatten()
        .filter(|s| !s.trim().is_empty());

    let config_had_creds = config_url.as_ref().map(has_embedded).unwrap_or(false);
    let source_url = if config_had_creds {
        config_url.clone()
    } else {
        setting_url.clone().filter(has_embedded)
    };
    let Some(source_url) = source_url else {
        return Ok(None);
    };

    let (cred, sanitized) = git_credentials::split_credentials_from_url(&source_url)
        .expect("source_url was checked to carry credentials");
    let host = git_credentials::https_host(&sanitized)
        .context("Cannot determine host for credential migration")?;

    // Step 1: token into the credential store. Nothing on disk has changed yet, so a
    // failure here leaves everything as it was.
    git_credentials::store_credential(&host, &cred)?;

    // Step 2: rewrite `.git/config` to the credential-free URL, then verify
    // that authentication through the credential store still works. Any failure rolls
    // back to the exact previous state.
    if config_had_creds {
        if let Err(e) = git_backup::set_remote_url_only(skills_dir, &sanitized) {
            let _ = git_credentials::delete_credential(&host);
            return Err(e);
        }
        if let Err(e) = git_backup::verify_remote_auth(skills_dir) {
            let _ = git_backup::set_remote_url_only(skills_dir, &source_url);
            let _ = git_credentials::delete_credential(&host);
            return Err(e.context(
                "Credential migration verification failed; previous configuration restored",
            ));
        }
    }

    // Step 3: rewrite the saved setting.
    if setting_url.as_deref() != Some(sanitized.as_str()) {
        if let Err(e) = store.set_setting("git_backup_remote_url", &sanitized) {
            if config_had_creds {
                let _ = git_backup::set_remote_url_only(skills_dir, &source_url);
            }
            let _ = git_credentials::delete_credential(&host);
            return Err(e);
        }
    }

    log::info!("git credentials: migrated embedded token to local credential store for {host}");
    Ok(Some(sanitized))
}

pub(crate) fn reconcile_skills_index_unlocked(store: &SkillStore) -> anyhow::Result<()> {
    sync_metadata::cleanup_temporary_files()?;
    if sync_metadata::has_complete_skill_snapshot() {
        match sync_metadata::reindex_from_metadata_unlocked(store) {
            Ok(()) => {
                if crate::core::shared_skill_index::register_missing(store)? {
                    sync_metadata::write_all_from_db_unlocked(store)?;
                }
                return Ok(());
            }
            // An empty remote snapshot can coexist with local-only Skills
            // carried forward by clone. Register them instead of discarding them.
            Err(err) if err.is::<sync_metadata::EmptySkillMetadata>() => {}
            Err(err) => return Err(err),
        }
    }

    let skills_dir = central_repo::skills_dir();
    std::fs::create_dir_all(&skills_dir)?;

    // Remove stale DB records whose central directories no longer exist.
    let existing = store.get_all_skills()?;
    for skill in existing {
        if !std::path::Path::new(&skill.central_path).exists() {
            store.delete_skill(&skill.id)?;
        }
    }

    crate::core::shared_skill_index::register_missing(store)?;

    sync_metadata::write_all_from_db_unlocked(store)
}

#[cfg(test)]
mod tests;
