//! System WebView adapter. It owns no Chromium process, CDP transport, or Chrome profile.
mod capture;
pub mod control;
pub mod cookies;
pub mod export;
mod platform;
mod profile;
use crate::core::error::AppError;
pub use control::{
    __cmd__preview_native_execute, __cmd__preview_native_frame, __cmd__preview_native_pick_mode,
    preview_native_execute, preview_native_frame, preview_native_pick_mode,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tauri::{Emitter, Manager};
pub struct NativeViews {
    gates: Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
    imports: Arc<crate::core::preview::cookies::Imports>,
    import_uas: Mutex<HashMap<String, (std::time::Instant, Option<String>)>>,
    cookie_gate: tokio::sync::Mutex<()>,
}
impl Default for NativeViews {
    fn default() -> Self {
        Self {
            gates: Mutex::default(),
            imports: crate::core::preview::cookies::Imports::shared(),
            import_uas: Mutex::default(),
            cookie_gate: tokio::sync::Mutex::new(()),
        }
    }
}
impl NativeViews {
    async fn lock(&self, id: &str) -> Result<tokio::sync::OwnedMutexGuard<()>, AppError> {
        let gate = self
            .gates
            .lock()
            .map_err(|_| AppError::internal("Native page state unavailable"))?
            .entry(id.into())
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
            .clone();
        Ok(gate.lock_owned().await)
    }
}

#[derive(Clone, Deserialize)]
pub struct NativeBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}
impl NativeBounds {
    fn validate(&self) -> Result<(), AppError> {
        if ![self.x, self.y, self.width, self.height]
            .iter()
            .all(|v| v.is_finite())
            || self.x < 0.0
            || self.y < 0.0
            || self.width < 1.0
            || self.height < 1.0
            || self.x + self.width > 20000.0
            || self.y + self.height > 20000.0
        {
            return Err(AppError::invalid_input("Invalid native browser bounds"));
        }
        Ok(())
    }
}
#[derive(Clone, Serialize)]
struct Location {
    id: String,
    url: String,
    loading: bool,
}
fn main_only(caller: &tauri::Webview) -> Result<(), AppError> {
    if caller.label() != "main" {
        return Err(AppError::invalid_input(
            "Native preview is controlled by the main workspace only",
        ));
    }
    Ok(())
}
fn native_url(url: &str) -> Result<tauri::Url, AppError> {
    crate::core::preview::navigation::validate_url(url)?;
    tauri::Url::parse(url).map_err(|error| AppError::invalid_input(error.to_string()))
}
fn target(caller: &tauri::Webview, id: &str) -> Result<tauri::Webview, AppError> {
    main_only(caller)?;
    if !id
        .strip_prefix("preview-native-")
        .is_some_and(|value| uuid::Uuid::parse_str(value).is_ok())
    {
        return Err(AppError::invalid_input("Invalid native preview identity"));
    }
    caller
        .app_handle()
        .get_webview(id)
        .filter(|view| view.window().label() == caller.window().label())
        .ok_or_else(|| AppError::not_found("Native preview is closed"))
}
#[tauri::command]
pub async fn preview_native_info(
    webview: tauri::Webview,
    id: Option<String>,
) -> Result<serde_json::Value, AppError> {
    main_only(&webview)?;
    let engine = if cfg!(target_os = "macos") {
        "WKWebView"
    } else if cfg!(windows) {
        "WebView2"
    } else {
        "WebKitGTK"
    };
    let ua = if let Some(id) = id.filter(|_| cfg!(target_os = "macos")) {
        control::metadata(&target(&webview, &id)?).await?["userAgent"].clone()
    } else {
        serde_json::Value::Null
    };
    Ok(
        serde_json::json!({"engine":engine,"version":tauri::webview_version().ok(),"userAgent":ua,"inspection":cfg!(target_os="macos"),"persistent":profile::persistent()}),
    )
}
#[tauri::command]
pub async fn preview_native_open(
    webview: tauri::Webview,
    url: String,
    bounds: NativeBounds,
) -> Result<String, AppError> {
    main_only(&webview)?;
    bounds.validate()?;
    let url = native_url(&url)?;
    let window = webview.window();
    if window
        .webviews()
        .iter()
        .filter(|view| view.label().starts_with("preview-native-"))
        .count()
        >= 12
    {
        return Err(AppError::invalid_input("PREVIEW_TAB_LIMIT"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let id = format!("preview-native-{}", uuid::Uuid::new_v4());
        let event_id = id.clone();
        let builder = tauri::webview::WebviewBuilder::new(&id, tauri::WebviewUrl::External(url))
            .incognito(true)
            .initialization_script(include_str!("preview_native/bridge.js").replace(
                "__PICK_FUNCTION__",
                include_str!("../core/preview/scripts/pick.js"),
            ))
            .focused(false)
            .on_navigation(|url| native_url(url.as_str()).is_ok())
            .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
            .on_page_load(move |view, payload| {
                let _ = view.app_handle().emit_to(
                    "main",
                    "preview-native-location",
                    Location {
                        id: event_id.clone(),
                        url: payload.url().to_string(),
                        loading: payload.event() == tauri::webview::PageLoadEvent::Started,
                    },
                );
            });
        let builder = profile::configure(builder)?;
        window
            .add_child(
                builder,
                tauri::LogicalPosition::new(bounds.x, bounds.y),
                tauri::LogicalSize::new(bounds.width, bounds.height),
            )
            .map_err(AppError::io)?;
        Ok(id)
    })
    .await
    .map_err(AppError::io)?
}
#[tauri::command]
pub fn preview_native_update(
    webview: tauri::Webview,
    id: String,
    visible: bool,
    bounds: Option<NativeBounds>,
    url: Option<String>,
) -> Result<(), AppError> {
    let view = target(&webview, &id)?;
    if let Some(bounds) = bounds {
        bounds.validate()?;
        view.set_position(tauri::LogicalPosition::new(bounds.x, bounds.y))
            .map_err(AppError::io)?;
        view.set_size(tauri::LogicalSize::new(bounds.width, bounds.height))
            .map_err(AppError::io)?;
    }
    if let Some(url) = url {
        view.navigate(native_url(&url)?).map_err(AppError::io)?;
    }
    if visible {
        view.show().map_err(AppError::io)?;
    } else {
        view.hide().map_err(AppError::io)?;
    }
    Ok(())
}
#[tauri::command]
pub fn preview_native_action(
    webview: tauri::Webview,
    id: String,
    action: String,
) -> Result<(), AppError> {
    let view = target(&webview, &id)?;
    match action.as_str() {
        "reload" => view.reload().map_err(AppError::io),
        "back" => view.eval("history.back()").map_err(AppError::io),
        "forward" => view.eval("history.forward()").map_err(AppError::io),
        "close" => {
            if let Ok(mut gates) = webview.state::<NativeViews>().gates.lock() {
                gates.remove(&id);
            }
            view.close().map_err(AppError::io)
        }
        _ => Err(AppError::invalid_input("Unsupported native browser action")),
    }
}

#[cfg(test)]
#[path = "preview_native/tests.rs"]
mod tests;
