use super::*;
use crate::core::preview::{actions::Action, capture};
use serde_json::{json, Value};
pub(super) const METADATA: &str = "({url:location.href,title:document.title,revision:String(performance.timeOrigin)+':'+String(window.__agentHubNativePreview?.navigation||0)+':'+location.href,ready:document.readyState,width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,scrollX,scrollY,dpr:devicePixelRatio,userAgent:navigator.userAgent})";
pub(super) fn inspection_events(value: &Value) -> Vec<Value> {
    let mut bytes: usize = 0;
    value
        .as_array()
        .into_iter()
        .flatten()
        .take(150)
        .filter(|event| {
            let valid = event["method"].as_str().is_some_and(|method| {
                matches!(
                    method,
                    "Runtime.consoleAPICalled"
                        | "Runtime.exceptionThrown"
                        | "Network.requestFinished"
                )
            }) && event["params"].is_object();
            if !valid {
                return false;
            }
            bytes = bytes
                .saturating_add(serde_json::to_vec(event).map_or(usize::MAX, |value| value.len()));
            bytes <= 1024 * 1024
        })
        .cloned()
        .collect()
}
pub(super) async fn metadata(view: &tauri::Webview) -> Result<Value, AppError> {
    platform::query(view, METADATA).await
}
pub(super) async fn verify(view: &tauri::Webview, revision: &str) -> Result<Value, AppError> {
    let info = metadata(view).await?;
    if info["revision"] != revision {
        return Err(AppError::cancelled("PREVIEW_CONTEXT_CHANGED"));
    }
    Ok(info)
}
#[tauri::command]
pub async fn preview_native_frame(webview: tauri::Webview, id: String) -> Result<Value, AppError> {
    let view = target(&webview, &id)?;
    let _job = webview.state::<NativeViews>().lock(&id).await?;
    let picking = webview.state::<NativeViews>().is_picking(&id);
    let state = platform::query(&view, &format!("(()=>{{const state=window.__agentHubNativePreview;const picked={picking}?state?.captured:null;const cancelled={picking}&&state?.cancelled;const events=state?.events?.splice(0,150)||[];if(state){{state.cancelled=false;state.eventBytes=0}}return {{info:{METADATA},picked,cancelled,events}}}})()")).await?;
    let info = &state["info"];
    let mut picked = Value::Null;
    let mut screenshot_unavailable = false;
    let mut operation = "capture";
    if let Some(captured) = state
        .get("picked")
        .filter(|value| picking && value.is_object())
    {
        let revision = captured["revision"]
            .as_str()
            .ok_or_else(|| AppError::invalid_input("Invalid native selection"))?;
        verify(&view, revision).await?;
        picked = capture::normalize(
            captured["value"].clone(),
            revision.into(),
            captured["url"].as_str().unwrap_or("").into(),
        )?;
        operation = captured["operation"]
            .as_str()
            .filter(|value| *value == "copy")
            .unwrap_or("capture");
        if picked.is_object() && operation != "copy" {
            match super::capture::screenshot(
                &view,
                false,
                Some(picked["documentBounds"].clone()),
                Some(revision.into()),
            )
            .await
            {
                Ok(image) => picked["screenshot"] = image["data"].clone(),
                Err(_) => screenshot_unavailable = true,
            }
        }
        verify(&view, revision).await?;
        let id = serde_json::to_string(&captured["id"]).map_err(AppError::io)?;
        platform::query(&view,&format!("(()=>{{const state=window.__agentHubNativePreview;if(state?.captured?.id==={id})state.captured=null;return true}})()")).await?;
    }
    let cancelled = picking && state["cancelled"] == true;
    if picked.is_object() || cancelled {
        webview.state::<NativeViews>().set_picking(&id, false);
    }
    Ok(
        json!({"frame":{"version":0,"image":"","info":info,"events":inspection_events(&state["events"])},"picked":picked,"operation":operation,"screenshotUnavailable":screenshot_unavailable,"cancelled":cancelled}),
    )
}

#[tauri::command]
pub async fn preview_native_pick_mode(
    webview: tauri::Webview,
    id: String,
    enabled: bool,
) -> Result<(), AppError> {
    let view = target(&webview, &id)?;
    if !enabled {
        webview.state::<NativeViews>().set_picking(&id, false);
    }
    let _job = webview.state::<NativeViews>().lock(&id).await?;
    platform::query(
        &view,
        &format!("(()=>{{window.__agentHubNativePreview?.enable({enabled});return true}})()"),
    )
    .await?;
    if enabled {
        webview.state::<NativeViews>().set_picking(&id, true);
    }
    Ok(())
}
#[tauri::command]
pub async fn preview_native_execute(
    webview: tauri::Webview,
    id: String,
    action: Action,
) -> Result<Value, AppError> {
    let view = target(&webview, &id)?;
    let _job = webview.state::<NativeViews>().lock(&id).await?;
    match action {
        Action::Devtools => {
            view.open_devtools();
            Ok(Value::Null)
        }
        Action::SetTheme { dark, system } => {
            platform::theme(&view, dark, system).await?;
            Ok(Value::Null)
        }
        Action::VerifyRevision { expected_revision } => {
            verify(&view, &expected_revision).await?;
            Ok(Value::Null)
        }
        Action::Evaluate { expression } => platform::evaluate(&view, &expression).await,
        Action::Navigate { url } => {
            view.navigate(native_url(&url)?).map_err(AppError::io)?;
            Ok(Value::Null)
        }
        Action::Reload { .. } => {
            view.reload().map_err(AppError::io)?;
            Ok(Value::Null)
        }
        Action::Back => platform::query(&view, "(history.back(),true)").await,
        Action::Forward => platform::query(&view, "(history.forward(),true)").await,
        Action::Stop => platform::query(&view, "(window.stop(),true)").await,
        Action::Find { text, backwards } => {
            platform::query(
                &view,
                &crate::core::preview::scripts::find(&text, backwards)?,
            )
            .await
        }
        Action::Cookies => {
            let info = metadata(&view).await?;
            let host = tauri::Url::parse(info["url"].as_str().unwrap_or(""))
                .ok()
                .and_then(|url| url.host_str().map(str::to_owned));
            let cookies = platform::cookies(&view)
                .await?
                .into_iter()
                .filter(|cookie| {
                    host.as_ref().is_some_and(|host| {
                        host == &cookie.domain
                            || (!cookie.host_only && host.ends_with(&format!(".{}", cookie.domain)))
                    })
                })
                .collect::<Vec<_>>();
            verify(&view, info["revision"].as_str().unwrap_or("")).await?;
            Ok(json!({"cookies":cookies}))
        }
        Action::Storage => platform::query(&view, crate::core::preview::scripts::STORAGE).await,
        Action::Snapshot => {
            let before = metadata(&view).await?;
            let token = uuid::Uuid::new_v4().simple().to_string();
            let expression = crate::core::preview::scripts::snapshot(&token);
            let mut result = platform::query(&view, &expression).await?;
            verify(&view, before["revision"].as_str().unwrap_or("")).await?;
            result["revision"] = before["revision"].clone();
            result["url"] = before["url"].clone();
            Ok(result)
        }
        Action::Pick { x, y } => {
            if !x.is_finite() || !y.is_finite() {
                return Err(AppError::invalid_input("Invalid pick position"));
            }
            let before = metadata(&view).await?;
            let value = platform::query(
                &view,
                &format!("({})({x},{y})", crate::core::preview::scripts::picker()),
            )
            .await?;
            let revision = before["revision"].as_str().unwrap_or("");
            verify(&view, revision).await?;
            capture::normalize(
                value,
                revision.into(),
                before["url"].as_str().unwrap_or("").into(),
            )
        }
        Action::Screenshot {
            full,
            clip,
            expected_revision,
        } => super::capture::screenshot(&view, full, clip, expected_revision).await,
        Action::InspectRef { reference } => {
            let before = metadata(&view).await?;
            let value = platform::query(
                &view,
                &crate::core::preview::scripts::reference(
                    &reference,
                    crate::core::preview::scripts::ReferenceAction::Inspect,
                )?,
            )
            .await?;
            let revision = before["revision"].as_str().unwrap_or("");
            verify(&view, revision).await?;
            capture::normalize(
                value,
                revision.into(),
                before["url"].as_str().unwrap_or("").into(),
            )
        }
        Action::ClickRef { reference } => {
            platform::query(
                &view,
                &crate::core::preview::scripts::reference(
                    &reference,
                    crate::core::preview::scripts::ReferenceAction::Click,
                )?,
            )
            .await
        }
        Action::FillRef { reference, value } => {
            platform::query(
                &view,
                &crate::core::preview::scripts::reference(
                    &reference,
                    crate::core::preview::scripts::ReferenceAction::Fill(&value),
                )?,
            )
            .await
        }
        _ => Err(AppError::invalid_input(
            "This operation is unavailable for the native engine",
        )),
    }
}
