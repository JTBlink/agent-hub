//! Automatic backup (§3.4): after central-repo changes settle for a couple of
//! minutes, commit and push in the background — no snapshot tag (tags are
//! reserved for user-visible backup points).
//!
//! With the object merge engine (merge-engine design §9 3d-γ) a round that
//! finds the remote ahead also merges it and pushes, so two devices converge
//! hands-free. The one deliberate exception (§4 收窄阻尼): while a remote
//! change touches a skill that is pending a local conflict decision, the
//! round backs off and waits for a manual sync — unrelated updates keep
//! flowing. With the `merge_engine=system` escape hatch the old behavior
//! (wait for manual sync whenever the remote is ahead) is kept.

use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

use super::central_repo;
use super::git_backup;
use super::merge;
use super::repo_lock::RepoLock;
use super::skill_store::SkillStore;

/// Off-switch setting. Anything except an explicit "off"-ish value means on.
const SETTING_ENABLED: &str = "backup_auto_enabled";
/// Last auto-backup failure, kept until a successful push (auto or manual)
/// clears it, so the Backup page failure card survives navigation/restart.
pub const SETTING_LAST_ERROR: &str = "backup_last_auto_error";
const EVENT_COMPLETED: &str = "backup-auto-completed";

/// Trailing debounce after the last central-repo change (§3.4 分钟级防抖).
const DEBOUNCE: Duration = Duration::from_secs(120);
/// Scheduler wake cadence; also the retry latency after a busy repo lock.
const POLL_INTERVAL: Duration = Duration::from_secs(15);
/// Delay before the first round, which uploads anything committed at the
/// previous exit. Matches the auto-updater's startup courtesy delay.
const INITIAL_DELAY: Duration = Duration::from_secs(90);
/// Cap for the exponential retry backoff after failed rounds: 2^5 × 2min ≈ 1h.
const MAX_BACKOFF_SHIFT: u32 = 5;

static DIRTY: AtomicBool = AtomicBool::new(false);
static LAST_CHANGE_MS: AtomicI64 = AtomicI64::new(0);
static CONSECUTIVE_FAILURES: AtomicU32 = AtomicU32::new(0);

/// Called by the file watcher whenever something outside `.git` changes in the
/// central repository. Re-arms the debounce window.
pub fn notify_central_change() {
    LAST_CHANGE_MS.store(chrono::Utc::now().timestamp_millis(), Ordering::Release);
    DIRTY.store(true, Ordering::Release);
}

/// Pure debounce/backoff decision, kept free of the statics for testability.
/// A round is due when a change is pending and the quiet period — stretched
/// exponentially by consecutive failures — has elapsed since the last change.
fn is_due(dirty: bool, last_change_ms: i64, now_ms: i64, failures: u32) -> bool {
    if !dirty {
        return false;
    }
    let quiet = DEBOUNCE.as_millis() as i64;
    let backoff = quiet << failures.min(MAX_BACKOFF_SHIFT);
    now_ms - last_change_ms >= backoff
}

pub fn is_enabled(store: &SkillStore) -> bool {
    let value = store
        .get_setting(SETTING_ENABLED)
        .ok()
        .flatten()
        .map(|v| v.trim().to_ascii_lowercase());
    !matches!(value.as_deref(), Some("off" | "false" | "0" | "no"))
}

#[derive(Debug, PartialEq)]
pub(crate) enum Outcome {
    /// Nothing attempted: disabled, no repo/remote, busy lock, needs repair.
    Skipped(&'static str),
    /// Tree clean and remote current — nothing to do.
    UpToDate,
    /// Committed and/or pushed successfully.
    BackedUp,
    /// The remote moved ahead (another device pushed). With the system
    /// engine this waits for a manual sync; with the object engine it is a
    /// transient state — the re-armed next round merges and pushes.
    RemoteAhead,
    /// §4 收窄阻尼: the remote touches a skill with an unresolved local
    /// conflict — deliberate backpressure until a manual decision.
    PausedOnConflict,
    Failed(String),
}

pub fn start<R: Runtime>(app: AppHandle<R>, store: Arc<SkillStore>) {
    tauri::async_runtime::spawn(run_scheduler(
        store,
        move |store, outcome| handle_outcome(&app, store, outcome),
        INITIAL_DELAY,
        POLL_INTERVAL,
    ));
}

/// Runs independently of the UI so background startup and actual uploads can
/// be verified together against an isolated library and local Git remote.
async fn run_scheduler(
    store: Arc<SkillStore>,
    on_outcome: impl Fn(&SkillStore, Outcome) + Send + 'static,
    initial_delay: Duration,
    poll_interval: Duration,
) {
    tokio::time::sleep(initial_delay).await;
    // Startup round also uploads the previous session's exit-time commit.
    LAST_CHANGE_MS.store(
        chrono::Utc::now().timestamp_millis() - DEBOUNCE.as_millis() as i64,
        Ordering::Release,
    );
    DIRTY.store(true, Ordering::Release);

    loop {
        let now_ms = chrono::Utc::now().timestamp_millis();
        if is_due(
            DIRTY.load(Ordering::Acquire),
            LAST_CHANGE_MS.load(Ordering::Acquire),
            now_ms,
            CONSECUTIVE_FAILURES.load(Ordering::Acquire),
        ) {
            DIRTY.store(false, Ordering::Release);
            let store_for_round = store.clone();
            let outcome =
                tauri::async_runtime::spawn_blocking(move || run_round_blocking(&store_for_round))
                    .await
                    .unwrap_or_else(|e| Outcome::Failed(format!("join error: {e}")));
            on_outcome(&store, outcome);
        }
        tokio::time::sleep(poll_interval).await;
    }
}

#[derive(Serialize, Clone)]
struct AutoBackupPayload {
    ok: bool,
    /// True when the remote moved ahead and a manual sync is needed.
    pending: bool,
    error: Option<String>,
}

fn handle_outcome<R: Runtime>(app: &AppHandle<R>, store: &SkillStore, outcome: Outcome) {
    let emit = |payload: AutoBackupPayload| {
        if let Err(e) = app.emit(EVENT_COMPLETED, payload) {
            log::debug!("auto backup: emit failed: {e}");
        }
    };
    let clear_error = |store: &SkillStore| {
        let had_error = matches!(
            store.get_setting(SETTING_LAST_ERROR).ok().flatten().as_deref(),
            Some(v) if !v.trim().is_empty()
        );
        if had_error {
            let _ = store.set_setting(SETTING_LAST_ERROR, "");
        }
        had_error
    };

    match outcome {
        Outcome::Skipped(reason) => {
            if reason == "repo busy" {
                // A foreground operation held the lock; retry on the next tick
                // (the change stamp is untouched, so the round is due again).
                DIRTY.store(true, Ordering::Release);
            }
            log::debug!("auto backup: skipped ({reason})");
        }
        Outcome::UpToDate => {
            CONSECUTIVE_FAILURES.store(0, Ordering::Release);
            // Only worth telling the UI if a stale failure card should clear.
            if clear_error(store) {
                emit(AutoBackupPayload {
                    ok: true,
                    pending: false,
                    error: None,
                });
            }
        }
        Outcome::BackedUp => {
            CONSECUTIVE_FAILURES.store(0, Ordering::Release);
            clear_error(store);
            log::info!("auto backup: committed/pushed");
            emit(AutoBackupPayload {
                ok: true,
                pending: false,
                error: None,
            });
        }
        Outcome::RemoteAhead => {
            CONSECUTIVE_FAILURES.store(0, Ordering::Release);
            log::info!("auto backup: remote is ahead, waiting for the next round or manual sync");
            emit(AutoBackupPayload {
                ok: false,
                pending: true,
                error: None,
            });
        }
        Outcome::PausedOnConflict => {
            CONSECUTIVE_FAILURES.store(0, Ordering::Release);
            log::info!(
                "auto backup: remote touches a pending conflict — paused until it is resolved (§4)"
            );
            emit(AutoBackupPayload {
                ok: false,
                pending: true,
                error: None,
            });
        }
        Outcome::Failed(msg) => {
            CONSECUTIVE_FAILURES.fetch_add(1, Ordering::AcqRel);
            log::warn!("auto backup: failed: {msg}");
            if let Err(e) = store.set_setting(SETTING_LAST_ERROR, &msg) {
                log::warn!("auto backup: failed to persist error: {e:#}");
            }
            // Re-arm so the round retries after the (backed-off) quiet period.
            notify_central_change();
            emit(AutoBackupPayload {
                ok: false,
                pending: false,
                error: Some(msg),
            });
        }
    }
}

pub(crate) fn run_round_blocking(store: &SkillStore) -> Outcome {
    if !is_enabled(store) {
        return Outcome::Skipped("disabled");
    }
    let skills_dir = super::backup_workspace::repo_dir();
    if !skills_dir.join(".git").exists() && !central_repo::skills_dir().join(".git").exists() {
        return Outcome::Skipped("no repo");
    }
    if git_backup::raw_remote_url(&skills_dir).is_none()
        && git_backup::raw_remote_url(&central_repo::skills_dir()).is_none()
    {
        return Outcome::Skipped("no remote");
    }
    crate::commands::git_backup::sync_engine_pref(store);

    // Fail fast instead of queueing behind a user-initiated operation.
    let Ok(_lock) = RepoLock::acquire("auto backup") else {
        return Outcome::Skipped("repo busy");
    };
    match super::backup_workspace::run_unlocked(store, |root| Ok(run_prepared_round(store, root))) {
        Ok(outcome) => outcome,
        Err(error) => Outcome::Failed(format!("{error:#}")),
    }
}

fn run_prepared_round(store: &SkillStore, skills_dir: &std::path::Path) -> Outcome {
    // Before the check below, which reports any error as a quiet skip: an
    // unreadable repo format must reach the backup card, not stall silently.
    if let Err(e) = git_backup::ensure_files_ref_format(skills_dir) {
        return Outcome::Failed(format!("{e:#}"));
    }
    if git_backup::ensure_no_interrupted_git_operation(skills_dir).is_err() {
        return Outcome::Skipped("interrupted git operation");
    }

    // Keep the failed fetch until after the local save, then stop. Retrying a
    // rejected credential with push only duplicates the error.
    let fetch_error = git_backup::fetch_remote(skills_dir).err();

    let status = match git_backup::get_status(skills_dir) {
        Ok(status) => status,
        Err(e) => return Outcome::Failed(format!("{e:#}")),
    };
    if status.upstream_health == "unrelated_histories" || status.upstream_health == "detached" {
        // The Backup page routes these to the recovery flow; retrying in the
        // background would only thrash.
        return Outcome::Skipped("needs manual repair");
    }

    crate::commands::git_backup::apply_device_identity(store, skills_dir);
    if let Err(e) = super::backup_workspace::write_metadata(store, skills_dir) {
        return Outcome::Failed(format!("{e:#}"));
    }
    // Before the dirty check, so a shrunk previously-excluded skill re-enters
    // the backup via the resulting .gitignore change (§3.6).
    if let Err(e) =
        git_backup::apply_oversized_exclusions(skills_dir, git_backup::SKILL_SIZE_LIMIT_BYTES)
    {
        log::debug!("auto backup: exclusion scan failed (continuing): {e:#}");
    }

    let mut committed = false;
    match git_backup::has_uncommitted_changes(skills_dir) {
        Ok(true) => {
            if let Err(e) = git_backup::commit_all_auto_unlocked(skills_dir) {
                return Outcome::Failed(format!("{e:#}"));
            }
            committed = true;
        }
        Ok(false) => {}
        Err(e) => return Outcome::Failed(format!("{e:#}")),
    }

    if let Some(error) = fetch_error {
        return Outcome::Failed(format!("{error:#}"));
    }

    if status.behind > 0 {
        // The system engine never line-merges in the background — the local
        // commit is safe, the merge waits for a user-driven sync.
        if !merge::object_merge_enabled(store) {
            return Outcome::RemoteAhead;
        }
        // §4 收窄阻尼: unrelated remote updates flow automatically; a remote
        // change to a skill awaiting a local conflict decision pauses the
        // round (deliberate backpressure, cleared by resolving + syncing).
        match merge::remote_touches_pending(store, skills_dir) {
            Ok(true) => return Outcome::PausedOnConflict,
            Ok(false) => {}
            Err(e) => return Outcome::Failed(format!("{e:#}")),
        }
        match merge::gated_pull_unlocked(store, skills_dir) {
            Ok(_summary) => {
                if let Err(e) = super::backup_workspace::reconcile(store, skills_dir) {
                    return Outcome::Failed(format!("{e:#}"));
                }
            }
            Err(e) => return Outcome::Failed(format!("{e:#}")),
        }
    }

    // Re-read after a possible merge: a merge commit shows up as ahead > 0,
    // a pure fast-forward leaves nothing to push.
    let status = match git_backup::get_status(skills_dir) {
        Ok(status) => status,
        Err(e) => return Outcome::Failed(format!("{e:#}")),
    };
    let needs_push = committed || status.ahead > 0 || status.upstream_health == "no_upstream";
    if !needs_push {
        return Outcome::UpToDate;
    }
    match git_backup::push_unlocked(skills_dir) {
        Ok(()) => Outcome::BackedUp,
        Err(e) => {
            let msg = format!("{e:#}");
            if msg.contains("non-fast-forward")
                || msg.contains("fetch first")
                || msg.contains("[rejected]")
                || msg.contains("failed to push some refs")
            {
                // Another device pushed inside our window. Re-arm so the next
                // round (post-debounce) fetches, merges and retries.
                notify_central_change();
                Outcome::RemoteAhead
            } else {
                Outcome::Failed(msg)
            }
        }
    }
}

/// Best-effort "退出前" save (§3.4): commit outstanding changes locally so
/// nothing is lost between sessions. Never touches the network — the next
/// startup round pushes — and never blocks quitting (fail-fast lock).
pub fn commit_on_exit(store: &SkillStore) {
    if !is_enabled(store) {
        return;
    }
    let skills_dir = super::backup_workspace::repo_dir();
    if !skills_dir.join(".git").exists() {
        return;
    }
    let Ok(_lock) = RepoLock::acquire("auto backup on exit") else {
        return;
    };
    if git_backup::ensure_no_interrupted_git_operation(&skills_dir).is_err() {
        return;
    }
    if let Err(e) = super::backup_workspace::prepare_unlocked(store) {
        log::warn!("exit backup preparation failed: {e:#}");
        return;
    }
    crate::commands::git_backup::apply_device_identity(store, &skills_dir);
    if let Err(e) = super::backup_workspace::write_metadata(store, &skills_dir) {
        log::warn!("auto backup on exit: metadata write failed: {e:#}");
    }
    match git_backup::has_uncommitted_changes(&skills_dir) {
        Ok(true) => {
            if let Err(e) = git_backup::commit_all_auto_unlocked(&skills_dir) {
                log::warn!("auto backup on exit: commit failed: {e:#}");
            } else {
                log::info!("auto backup on exit: committed pending changes");
            }
        }
        Ok(false) => {}
        Err(e) => log::warn!("auto backup on exit: status check failed: {e:#}"),
    }
    if let Err(e) = super::backup_workspace::finish_unlocked(store) {
        log::warn!("exit backup publication failed: {e:#}");
    }
}

#[cfg(test)]
mod tests;
