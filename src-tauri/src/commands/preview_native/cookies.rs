//! Native login import reuses the shared staging, domain and expiry policy.
use super::*;
use crate::core::preview::cookies::{self as login, policy::Cookie};
use serde::Deserialize;
use serde_json::{json, Value};
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Source {
    Text { text: String },
    Browser { endpoint: String },
    File { format: String },
}
#[tauri::command]
pub async fn preview_native_cookie_prepare(
    webview: tauri::Webview,
    id: String,
    revision: String,
    source: Source,
) -> Result<Option<Value>, AppError> {
    let view = target(&webview, &id)?;
    let info = control::verify(&view, &revision).await?;
    let (value, ua) = match source {
        Source::Text { text } => {
            if text.len() > login::policy::MAX_BYTES {
                return Err(AppError::invalid_input("Cookie import exceeds 2 MiB"));
            }
            (
                serde_json::from_str(&text)
                    .map_err(|_| AppError::invalid_input("Invalid cookie JSON"))?,
                None,
            )
        }
        Source::Browser { endpoint } => {
            tauri::async_runtime::spawn_blocking(move || login::sources::browser_session(&endpoint))
                .await??
        }
        Source::File { format } => {
            if !["json", "netscape", "firefox"].contains(&format.as_str()) {
                return Err(AppError::invalid_input("Unsupported cookie format"));
            }
            let Some(file) = rfd::AsyncFileDialog::new().pick_file().await else {
                return Ok(None);
            };
            let path = file.path().to_path_buf();
            (
                tauri::async_runtime::spawn_blocking(move || login::sources::file(&path, &format))
                    .await??,
                None,
            )
        }
    };
    control::verify(&view, &revision).await?;
    let target = login::Target {
        id: id.clone(),
        profile: "native".into(),
        profile_name: "System WebView".into(),
        revision,
        title: info["title"].as_str().unwrap_or("").into(),
        url: info["url"].as_str().unwrap_or("").into(),
    };
    let state = webview.state::<NativeViews>();
    let summary = state.imports.prepare_target(target, value)?;
    let batch = summary.id.clone();
    {
        let mut pending = state
            .import_uas
            .lock()
            .map_err(|_| AppError::internal("Native login imports unavailable"))?;
        pending.retain(|_, (at, _)| at.elapsed() < std::time::Duration::from_secs(300));
        pending.insert(batch.clone(), (std::time::Instant::now(), ua.clone()));
    }
    let mut summary = serde_json::to_value(summary).map_err(AppError::io)?;
    summary["id"] = json!(format!("native-import:{batch}"));
    summary["source_user_agent"] = json!(ua);
    summary["replace_supported"] = json!(false);
    Ok(Some(summary))
}
#[tauri::command]
pub fn preview_native_cookie_cancel(
    webview: tauri::Webview,
    import_id: String,
) -> Result<(), AppError> {
    main_only(&webview)?;
    let id = batch_id(&import_id)?;
    let state = webview.state::<NativeViews>();
    state.imports.cancel(id);
    if let Ok(mut pending) = state.import_uas.lock() {
        pending.remove(id);
    }
    Ok(())
}
fn batch_id(id: &str) -> Result<&str, AppError> {
    id.strip_prefix("native-import:")
        .filter(|id| uuid::Uuid::parse_str(id).is_ok())
        .ok_or_else(|| AppError::invalid_input("Invalid native import identity"))
}
#[tauri::command]
pub async fn preview_native_cookie_apply(
    webview: tauri::Webview,
    import_id: String,
    domains: Vec<String>,
    replace: bool,
    sync_user_agent: bool,
) -> Result<Value, AppError> {
    main_only(&webview)?;
    if replace {
        return Err(AppError::invalid_input(
            "Native import currently supports merging; cookie partitions cannot be safely replaced",
        ));
    }
    let batch = batch_id(&import_id)?;
    let state = webview.state::<NativeViews>();
    let ua = state
        .import_uas
        .lock()
        .map_err(|_| AppError::internal("Native login imports unavailable"))?
        .remove(batch)
        .and_then(|(_, ua)| ua);
    let (target, cookies) = state.imports.take(batch, domains)?;
    let view = super::target(&webview, &target.id)?;
    let _job = state.lock(&target.id).await?;
    let _mutation = state.cookie_gate.lock().await;
    let info = control::verify(&view, &target.revision).await?;
    if info["url"] != target.url {
        return Err(AppError::cancelled("PREVIEW_CONTEXT_CHANGED"));
    }
    let selected = cookies
        .iter()
        .map(|cookie| cookie.domain.as_str())
        .collect::<std::collections::HashSet<_>>();
    let original = platform::cookies(&view)
        .await?
        .into_iter()
        .filter(|cookie| selected.contains(cookie.domain.as_str()))
        .collect::<Vec<_>>();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(AppError::io)?
        .as_secs_f64();
    if cookies
        .iter()
        .any(|cookie| cookie.expires.is_some_and(|expires| expires <= now))
    {
        return Err(AppError::cancelled(
            "Cookies expired; inspect the source again",
        ));
    }
    let old_ua = info["userAgent"].as_str().map(str::to_owned);
    let old_config = profile::read_ua()?;
    let mut written = Vec::new();
    let result = async {
        let started = std::time::Instant::now();
        for cookie in &cookies {
            if started.elapsed() > std::time::Duration::from_secs(30) {
                return Err(AppError::network("Native cookie import timed out"));
            }
            control::verify(&view, &target.revision).await?;
            written.push(cookie.clone());
            platform::mutate_cookie(&view, cookie.clone(), false).await?;
        }
        if sync_user_agent {
            if let Some(ua) = ua.as_ref() {
                platform::user_agent(&view, Some(ua.clone())).await?;
                profile::write_ua(Some(ua))?;
            }
        }
        control::verify(&view, &target.revision).await?;
        Ok::<_, AppError>(json!({"imported":written.len(),"removed":0}))
    }
    .await;
    if result.is_err() {
        let restored = restore(&view, &written, &original).await;
        if sync_user_agent {
            let _ = platform::user_agent(&view, old_ua).await;
            let _ = profile::write_ua(old_config.as_deref());
        }
        if restored.is_err() {
            return Err(AppError::network(
                "Native login import outcome is uncertain; inspect the target before retrying",
            ));
        }
    }
    result
}
async fn restore(
    view: &tauri::Webview,
    written: &[Cookie],
    original: &[Cookie],
) -> Result<(), AppError> {
    for cookie in written {
        platform::mutate_cookie(view, cookie.clone(), true).await?;
    }
    for cookie in original {
        platform::mutate_cookie(view, cookie.clone(), false).await?;
    }
    let current = platform::cookies(view).await?;
    for cookie in original {
        if !current
            .iter()
            .any(|other| other.key() == cookie.key() && other.value == cookie.value)
        {
            return Err(AppError::network("Native cookies could not be restored"));
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn preview_native_user_agent(
    webview: tauri::Webview,
    id: String,
    value: Option<String>,
) -> Result<(), AppError> {
    let view = target(&webview, &id)?;
    let state = webview.state::<NativeViews>();
    let _job = state.lock(&id).await?;
    let old = control::metadata(&view).await?["userAgent"]
        .as_str()
        .map(str::to_owned);
    let _mutation = state.cookie_gate.lock().await;
    platform::user_agent(&view, value.clone()).await?;
    if let Err(error) = profile::write_ua(value.as_deref()) {
        let _ = platform::user_agent(&view, old).await;
        return Err(error);
    }
    Ok(())
}
