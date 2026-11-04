//! Shared AgentHub application library for the desktop host and CLI.

mod desktop;
mod smoke;
mod window_layout;

pub mod commands;
pub mod core;

pub use desktop::builder;
pub use desktop::lifecycle::{quit_app, restart_app, QUITTING};
pub use desktop::tray::set_tray_icon_enabled;
pub use smoke::run_package_smoke;

pub(crate) use desktop::tray::{refresh_tray_menu, schedule_tray_refresh};

/// Run a desktop host using its configuration and bundled frontend assets.
///
/// Generate the Context in the executable crate. Hosts that add plugins can
/// instead call [`builder`] and then run the configured builder themselves.
pub fn run(context: tauri::Context<tauri::Wry>) {
    builder()
        .expect("Failed to initialize app state")
        .run(context)
        .expect("error while running tauri application");
}
