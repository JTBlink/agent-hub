//! Shared desktop initialization, background services, and close handling.

use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Instant;
use tauri::{Emitter, Manager};

use super::lifecycle::QUITTING;
use super::tray::{ensure_tray_icon, is_tray_icon_enabled};
use crate::{commands, core, window_layout};

pub(super) fn setup(
    app: &mut tauri::App,
    store: Arc<core::skill_store::SkillStore>,
    startup_timings: core::app_state::StartupTimings,
    pre_builder_ms: u128,
    builder_start: Instant,
) -> Result<(), Box<dyn std::error::Error>> {
    let builder_to_setup_ms = builder_start.elapsed().as_millis();
    let setup_start = Instant::now();
    initialize_logging(app, startup_timings, pre_builder_ms, builder_to_setup_ms)?;
    start_background_repairs(&store);

    let step = Instant::now();
    if is_tray_icon_enabled(&store) {
        ensure_tray_icon(app.handle())?;
        log::info!(
            "startup: ensure_tray_icon done in {} ms",
            step.elapsed().as_millis()
        );
    } else {
        log::info!("startup: tray icon disabled");
    }

    start_sync_services(app, &store);
    configure_main_window(app, &store);
    log::info!(
        "startup: setup() body total {} ms",
        setup_start.elapsed().as_millis()
    );
    Ok(())
}

fn initialize_logging(
    app: &mut tauri::App,
    startup_timings: core::app_state::StartupTimings,
    pre_builder_ms: u128,
    builder_to_setup_ms: u128,
) -> Result<(), Box<dyn std::error::Error>> {
    let preview = app.state::<Arc<core::preview::Preview>>().inner().clone();
    std::thread::spawn(move || {
        if preview.start_automation().is_err() {
            log::warn!("Preview automation bridge did not start");
        }
    });
    app.handle().plugin(
        tauri_plugin_log::Builder::default()
            .targets([
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Folder {
                    path: core::central_repo::log_dir(),
                    file_name: Some("agent-hub".into()),
                }),
            ])
            .level(log::LevelFilter::Info)
            .level_for("tao", log::LevelFilter::Warn)
            .level_for("wry", log::LevelFilter::Warn)
            .level_for("hyper", log::LevelFilter::Warn)
            .level_for("reqwest", log::LevelFilter::Warn)
            .level_for("rustls", log::LevelFilter::Warn)
            .max_file_size(5 * 1024 * 1024)
            // Two archives plus the active log: three files in total.
            .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(2))
            .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
            .format(|out, message, record| {
                out.finish(format_args!(
                    "{} {:5} [{}] {}",
                    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3f%:z"),
                    record.level(),
                    record.target(),
                    message
                ))
            })
            .build(),
    )?;

    core::panic_log::install_panic_hook(app.handle().clone());
    log::info!(
        "app start: version={} os={} arch={}",
        app.config().version.clone().unwrap_or_default(),
        std::env::consts::OS,
        std::env::consts::ARCH
    );
    log::info!(
        "startup: pre_builder {} ms, builder_to_setup {} ms",
        pre_builder_ms,
        builder_to_setup_ms
    );
    startup_timings.log();

    // Flush any errors stashed while resolving the central repo — that
    // ran before this logger existed, so its own log calls were no-ops
    // (e.g. a central-library migration that fell back to the source).
    for detail in core::central_repo::take_startup_errors() {
        log::error!("{detail}");
    }

    Ok(())
}

fn start_background_repairs(store: &Arc<core::skill_store::SkillStore>) {
    // One-time repair for skills uploaded before sync targets were
    // registered on import: they have a center record but no target,
    // leaving them button-less in the workspace. This scans and hashes
    // every agent's local skills, so it must NOT block the window
    // (#248: it ran ~8s synchronously here on every launch). Run it in
    // the background after the UI is up; the function itself skips the
    // scan when the stranded set is unchanged from the last attempt.
    let store_for_backfill = store.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let step = Instant::now();
        let repaired =
            commands::agent_workspace::backfill_stranded_agent_targets(&store_for_backfill);
        if repaired > 0 {
            log::info!(
                "startup: backfilled {} stranded agent skill target(s) in {} ms",
                repaired,
                step.elapsed().as_millis()
            );
        }
    });

    // Publish the CLI that ships in this bundle to a fixed path so
    // agents can drive agent-hub without it being on PATH. A
    // ~15 MB copy plus one `--version` run, so never on the UI thread.
    // The crate version, not `tauri.conf.json`'s: it is what the CLI
    // reports about itself, and the bridge verifies the copy by asking
    // it. Reading the app config here would silently disable the
    // bridge for everyone if the two ever drifted apart.
    tauri::async_runtime::spawn_blocking(|| {
        let step = Instant::now();
        core::cli_bridge::ensure_bridge(env!("CARGO_PKG_VERSION"));
        log::info!(
            "startup: cli bridge step done in {} ms",
            step.elapsed().as_millis()
        );
    });
}

fn start_sync_services(app: &tauri::App, store: &Arc<core::skill_store::SkillStore>) {
    let step = Instant::now();
    core::file_watcher::start_file_watcher(app.handle().clone(), store.clone());
    core::automation::start_change_events(app.handle().clone());
    log::info!(
        "startup: start_file_watcher done in {} ms",
        step.elapsed().as_millis()
    );

    let step = Instant::now();
    core::skill_auto_updater::start(app.handle().clone(), store.clone());
    log::info!(
        "startup: skill auto-updater spawned in {} ms",
        step.elapsed().as_millis()
    );

    #[cfg(feature = "cloud-sync")]
    start_cloud_sync(app, store);
}

#[cfg(feature = "cloud-sync")]
fn start_cloud_sync(app: &tauri::App, store: &Arc<core::skill_store::SkillStore>) {
    // Object-merge crash recovery (merge-engine design §5): finish or
    // roll back an interrupted sync apply before any background work
    // can touch the repo. Best-effort, never blocks startup.
    let store_for_merge_recovery = store.clone();
    tauri::async_runtime::spawn_blocking(move || {
        core::merge::recover_on_startup(
            &store_for_merge_recovery,
            &core::backup_workspace::repo_dir(),
        );
        core::backup_workspace::recover_on_startup(&store_for_merge_recovery);
    });

    // Automatic backup (§3.4): debounced commit+push after central-repo
    // changes; the first round also uploads whatever the exit-time
    // commit captured last session.
    core::auto_backup::start(app.handle().clone(), store.clone());

    // One-time (idempotent) security migration: move credentials
    // embedded in the backup remote URL into the OS keychain so no
    // token stays in `.git/config`. Best-effort in the background —
    // offline machines retry on the next launch.
    if core::git_credentials::background_access_enabled() {
        let store_for_cred_migration = store.clone();
        tauri::async_runtime::spawn_blocking(move || {
            match commands::git_backup::migrate_embedded_credentials(&store_for_cred_migration) {
                Ok(Some(_)) => log::info!("startup: migrated backup token to OS keychain"),
                Ok(None) => {}
                Err(e) => log::warn!("startup: backup credential migration skipped: {e:#}"),
            }
        });
    } else {
        log::info!(
            "startup: backup credential migration skipped for debug build; set AGENT_HUB_DEV_KEYCHAIN=1 to opt in"
        );
    }
}

fn configure_main_window(app: &tauri::App, store: &Arc<core::skill_store::SkillStore>) {
    // Intercept window close — let frontend decide (close vs hide to tray)
    // When QUITTING is set, allow the close to proceed so the process fully exits.
    let step = Instant::now();
    let win = app.get_window("main").unwrap();
    window_layout::restore(&win, store);
    let win_for_event = win.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            window_layout::save(&win_for_event);
            if QUITTING.load(Ordering::SeqCst) {
                return; // allow close
            }
            win_for_event.emit("window-close-requested", ()).ok();
            api.prevent_close();
        }
    });
    log::info!(
        "startup: window handle + close hook in {} ms",
        step.elapsed().as_millis()
    );
}
