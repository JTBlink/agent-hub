//! Shared window restoration and application shutdown lifecycle.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Manager;

use crate::{core, window_layout};

/// Shared flag: when true, CloseRequested should NOT be prevented.
pub static QUITTING: AtomicBool = AtomicBool::new(false);

pub(super) fn restore_main_window(app: &tauri::AppHandle) {
    let app_for_main = app.clone();
    if let Err(err) = app.run_on_main_thread(move || {
        #[cfg(target_os = "macos")]
        {
            if let Err(err) = app_for_main.set_dock_visibility(true) {
                log::error!("Failed to show Dock icon on macOS: {err}");
            }
            if let Err(err) = app_for_main.set_activation_policy(tauri::ActivationPolicy::Regular) {
                log::error!("Failed to set activation policy to Regular on macOS: {err}");
            }
            if let Err(err) = app_for_main.show() {
                log::error!("Failed to show app on macOS: {err}");
            }
        }

        if let Some(w) = app_for_main.get_window("main") {
            if let Err(err) = w.show() {
                log::error!("Failed to show main window: {err}");
            }
            if let Err(err) = w.unminimize() {
                log::error!("Failed to unminimize main window: {err}");
            }
            if let Err(err) = w.set_focus() {
                log::error!("Failed to focus main window: {err}");
            }
        } else {
            log::error!("Main window not found while restoring from tray");
        }
    }) {
        log::error!("Failed to schedule restore_main_window on main thread: {err}");
    }
}

/// Quit the application cleanly: destroy the main window, then exit.
///
/// Do NOT signal our process group here (e.g. `kill(-pgid, SIGTERM)`).
/// On Linux the app inherits the launcher's pgid — that may be the user's
/// desktop session (issue #47, tearing down GNOME) or the developer's shell
/// (terminating the parent terminal and its sibling jobs). Either is
/// catastrophic and not worth the convenience of auto-cleaning a stray
/// `tauri dev` vite process.
pub fn quit_app(app: &tauri::AppHandle) {
    teardown_before_exit(app);
    app.exit(0);
}

/// Restart the process, running the same teardown `quit_app` does.
///
/// Called after an in-app update has replaced the bundle on disk. Reuses
/// `teardown_before_exit` rather than restarting outright: skipping it would
/// drop the exit-time local backup commit, so a user who restarts instead of
/// quitting would silently lose it.
///
/// `request_restart`, not `restart`: on the main thread the latter spawns the
/// replacement process and exits without ever emitting `RunEvent::Exit`, and
/// `tauri-plugin-single-instance` removes its socket only on that event. The
/// old process usually exits before the new one gets far enough to connect —
/// leaving a stale socket file the next launch cleans up on `ConnectionRefused`
/// — but nothing enforces that ordering, and losing the race means the new
/// instance sees a live singleton and exits immediately, taking the app down
/// instead of restarting it. Going through the exit event closes the window.
pub fn restart_app(app: &tauri::AppHandle) {
    teardown_before_exit(app);
    app.request_restart();
}

fn teardown_before_exit(app: &tauri::AppHandle) {
    QUITTING.store(true, Ordering::SeqCst);
    if let Some(terminals) = app.try_state::<Arc<core::terminal::TerminalManager>>() {
        terminals.close_all();
    }
    if let Some(w) = app.get_window("main") {
        window_layout::save(&w);
        if let Err(err) = w.destroy() {
            log::error!("Failed to destroy main window while quitting: {err}");
        }
    }
    if let Some(preview) = app.try_state::<Arc<core::preview::Preview>>() {
        preview.clear();
    }
    if let Some(previews) = app.try_state::<Arc<core::file_preview::FilePreviews>>() {
        if let Err(error) = previews.clear() {
            log::warn!("Cannot clear preview copies: {error}");
        }
    }
    // 退出前 auto-backup (§3.4): local commit only, fail-fast on a busy lock,
    // after the window is gone so quitting feels instant.
    #[cfg(feature = "cloud-sync")]
    if let Some(store) = app.try_state::<Arc<core::skill_store::SkillStore>>() {
        core::auto_backup::commit_on_exit(&store);
    }
}
