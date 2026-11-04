//! WebKitGTK callbacks execute on GTK's main context; only owned JSON/PNG bytes cross threads.
use super::*;
use javascriptcore::ValueExt;
use webkit2gtk::gio;
use webkit2gtk::{SettingsExt, WebViewExt};

pub async fn query(view: &tauri::Webview, expression: &str) -> Result<Value, AppError> {
    execute(view, script::query(expression)?, true).await
}
pub async fn evaluate(view: &tauri::Webview, expression: &str) -> Result<Value, AppError> {
    script::validate(expression)?;
    execute(view, expression.into(), false).await
}
async fn execute(view: &tauri::Webview, source: String, wrapped: bool) -> Result<Value, AppError> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    view.with_webview(move |platform| {
        platform.inner().evaluate_javascript(
            &source,
            None,
            None,
            None::<&gio::Cancellable>,
            move |result| {
                let result = result.map_err(AppError::network).and_then(|value| {
                    script::decode(value.to_json(0).as_deref().unwrap_or("null"), wrapped)
                });
                let _ = sender.send(result);
            },
        );
    })
    .map_err(AppError::io)?;
    super::receive(receiver).await
}
pub async fn snapshot(view: &tauri::Webview) -> Result<Vec<u8>, AppError> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    view.with_webview(move |platform| {
        platform.inner().snapshot(
            webkit2gtk::SnapshotRegion::Visible,
            webkit2gtk::SnapshotOptions::NONE,
            None::<&gio::Cancellable>,
            move |result| {
                let result = result.map_err(AppError::network).and_then(|surface| {
                    let mut bytes = Vec::new();
                    surface.write_to_png(&mut bytes).map_err(AppError::io)?;
                    if bytes.len() > 18 * 1024 * 1024 {
                        return Err(AppError::invalid_input("Native screenshot exceeds limit"));
                    }
                    Ok(bytes)
                });
                let _ = sender.send(result);
            },
        );
    })
    .map_err(AppError::io)?;
    super::receive(receiver).await
}
pub async fn user_agent(view: &tauri::Webview, value: Option<String>) -> Result<(), AppError> {
    super::super::profile::validate_ua(value.as_deref())?;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    view.with_webview(move |platform| {
        let result = platform
            .inner()
            .settings()
            .ok_or_else(|| AppError::network("Native settings unavailable"))
            .map(|settings| settings.set_user_agent(value.as_deref()));
        let _ = sender.send(result);
    })
    .map_err(AppError::io)?;
    super::receive(receiver).await
}
fn apply_theme(dark: bool, system: bool) -> Result<(), AppError> {
    use gtk::prelude::GtkSettingsExt;
    let settings =
        gtk::Settings::default().ok_or_else(|| AppError::network("GTK settings unavailable"))?;
    if system {
        settings.reset_property("gtk-application-prefer-dark-theme");
    } else {
        settings.set_gtk_application_prefer_dark_theme(dark);
    }
    Ok(())
}
pub fn restore_theme(view: &tauri::Webview) -> Result<(), AppError> {
    view.with_webview(|_| {
        let _ = apply_theme(false, true);
    })
    .map_err(AppError::io)
}
pub async fn theme(view: &tauri::Webview, dark: bool, system: bool) -> Result<(), AppError> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    view.with_webview(move |_| {
        let _ = sender.send(apply_theme(dark, system));
    })
    .map_err(AppError::io)?;
    super::receive(receiver).await
}
