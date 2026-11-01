//! Initial workbench size and restoration, constrained to the current work area.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{LogicalSize, Manager, PhysicalPosition, WebviewWindow};

use crate::core::skill_store::SkillStore;

const WINDOW_SIZE_KEY: &str = "main_window_size";

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
struct WindowSize {
    width: f64,
    height: f64,
}

impl WindowSize {
    fn is_valid(self) -> bool {
        self.width.is_finite() && self.height.is_finite() && self.width > 0.0 && self.height > 0.0
    }
}

fn fit_size(requested: WindowSize, minimum: WindowSize, available: WindowSize) -> WindowSize {
    let width = available.width.max(1.0);
    let height = available.height.max(1.0);
    WindowSize {
        width: requested.width.max(minimum.width.min(width)).min(width),
        height: requested.height.max(minimum.height.min(height)).min(height),
    }
}

pub fn restore(window: &WebviewWindow, store: &SkillStore) {
    let Some(config) = window
        .app_handle()
        .config()
        .app
        .windows
        .iter()
        .find(|config| config.label == window.label())
    else {
        return;
    };
    let requested = store
        .get_setting(WINDOW_SIZE_KEY)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_str::<WindowSize>(&value).ok())
        .filter(|size| size.is_valid());
    let Some(monitor) = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
    else {
        return;
    };
    let work_area = monitor.work_area();
    let logical = work_area.size.to_logical::<f64>(monitor.scale_factor());
    let minimum = WindowSize {
        width: config.min_width.unwrap_or(0.0),
        height: config.min_height.unwrap_or(0.0),
    };
    let available = WindowSize {
        width: logical.width,
        height: logical.height,
    };
    let size = fit_size(requested.unwrap_or(available), minimum, available);
    let min = fit_size(minimum, minimum, available);
    let apply = || -> tauri::Result<()> {
        window.set_min_size(Some(LogicalSize::new(min.width, min.height)))?;
        window.set_size(LogicalSize::new(size.width, size.height))?;
        let outer = window.outer_size()?;
        window.set_position(PhysicalPosition::new(
            work_area.position.x + (work_area.size.width.saturating_sub(outer.width) / 2) as i32,
            work_area.position.y + (work_area.size.height.saturating_sub(outer.height) / 2) as i32,
        ))?;
        // Open at the monitor's usable screen bounds. The saved normal size is
        // retained for the user to restore with the native window controls.
        if config.maximized {
            window.maximize()?;
        }
        Ok(())
    };
    if let Err(error) = apply() {
        log::warn!("Cannot restore workbench window size: {error}");
    }
}

pub fn save(window: &WebviewWindow) {
    // A temporary minimized/full-screen/maximized frame must not replace the
    // user's normal editing size.
    if window.is_minimized().unwrap_or(false)
        || window.is_maximized().unwrap_or(false)
        || window.is_fullscreen().unwrap_or(false)
    {
        return;
    }
    let (Ok(size), Ok(scale)) = (window.inner_size(), window.scale_factor()) else {
        return;
    };
    let logical = size.to_logical::<f64>(scale);
    let size = WindowSize {
        width: logical.width,
        height: logical.height,
    };
    if !size.is_valid() {
        return;
    }
    let Some(store) = window.try_state::<Arc<SkillStore>>() else {
        return;
    };
    if let Ok(value) = serde_json::to_string(&size) {
        if let Err(error) = store.set_setting(WINDOW_SIZE_KEY, &value) {
            log::warn!("Cannot save workbench window size: {error}");
        }
    }
}

#[cfg(test)]
mod tests;
