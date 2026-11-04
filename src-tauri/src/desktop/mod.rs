//! Desktop composition; shared behavior is configured before the host runs it.

mod ipc;
pub(crate) mod lifecycle;
mod startup;
pub(crate) mod tray;

use std::sync::Arc;
use std::time::Instant;

use crate::{commands, core};
use lifecycle::restore_main_window;

/// Configure shared application state, services, lifecycle, and trusted IPC.
///
/// A host can append Tauri plugins and run this builder with its own Context.
/// Add extension commands and initialization through plugins: calling `setup`
/// or `invoke_handler` on the returned builder replaces the shared handler.
/// This initializes the application store; call once per desktop launch.
pub fn builder() -> anyhow::Result<tauri::Builder<tauri::Wry>> {
    let pre_builder_start = Instant::now();
    let (store, startup_timings) = core::app_state::initialize_store()?;
    let pre_builder_ms = pre_builder_start.elapsed().as_millis();
    let store_for_setup = store.clone();

    let cancel_registry = Arc::new(core::install_cancel::InstallCancelRegistry::new());

    let builder_start = Instant::now();
    Ok(tauri::Builder::default()
        .manage(store)
        .manage(cancel_registry)
        .manage(Arc::new(core::agent_usage::AgentUsage::default()))
        .manage(Arc::new(std::sync::Mutex::new(
            core::system_load::SystemLoad::default(),
        )))
        .manage(Arc::new(core::terminal::TerminalManager::default()))
        .manage(Arc::new(core::herdr::tools::HerdrTools::default()))
        .manage(Arc::new(core::file_preview::FilePreviews::default()))
        .manage(Arc::new(core::preview::Preview::default()))
        .manage(commands::preview_native::NativeViews::default())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            restore_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            startup::setup(
                app,
                store_for_setup,
                startup_timings,
                pre_builder_ms,
                builder_start,
            )
        })
        .invoke_handler(ipc::handler()))
}
