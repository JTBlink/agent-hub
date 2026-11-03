use super::*;
use crate::core::preview::{actions::Action, capture};
use serde_json::{json, Value};
pub(super) const METADATA: &str = "({url:location.href,title:document.title,revision:String(performance.timeOrigin)+':'+String(window.__agentHubNativePreview?.navigation||0)+':'+location.href,ready:document.readyState,width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,scrollX,scrollY,dpr:devicePixelRatio,userAgent:navigator.userAgent})";
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
    let state = platform::query(&view, &format!("(()=>{{const state=window.__agentHubNativePreview;const picked=state?.captured;const cancelled=state?.cancelled;if(state){{state.captured=null;state.cancelled=false}}return {{info:{METADATA},picked,cancelled}}}})()")).await?;
    let info = &state["info"];
    let mut picked = Value::Null;
    if let Some(captured) = state.get("picked").filter(|value| value.is_object()) {
        let revision = captured["revision"]
            .as_str()
            .ok_or_else(|| AppError::invalid_input("Invalid native selection"))?;
        verify(&view, revision).await?;
        picked = capture::normalize(
            captured["value"].clone(),
            revision.into(),
            captured["url"].as_str().unwrap_or("").into(),
        )?;
        if picked.is_object() {
            let image = super::capture::screenshot(
                &view,
                false,
                Some(picked["documentBounds"].clone()),
                Some(revision.into()),
            )
            .await?;
            picked["screenshot"] = image["data"].clone();
        }
    }
    Ok(
        json!({"frame":{"version":0,"image":"","info":info,"events":[]},"picked":picked,"cancelled":state["cancelled"]}),
    )
}
#[tauri::command]
pub async fn preview_native_pick_mode(
    webview: tauri::Webview,
    id: String,
    enabled: bool,
) -> Result<(), AppError> {
    let view = target(&webview, &id)?;
    let _job = webview.state::<NativeViews>().lock(&id).await?;
    platform::query(
        &view,
        &format!("(()=>{{window.__agentHubNativePreview?.enable({enabled});return true}})()"),
    )
    .await?;
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
        Action::VerifyRevision { expected_revision } => {
            verify(&view, &expected_revision).await?;
            Ok(Value::Null)
        }
        Action::Evaluate { expression } => platform::query(&view, &expression).await,
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
            let text = serde_json::to_string(&text).map_err(AppError::io)?;
            platform::query(
                &view,
                &format!("({{found:window.find({text},false,{backwards},true),count:1}})"),
            )
            .await
        }
        Action::Snapshot => {
            let before = metadata(&view).await?;
            let token = uuid::Uuid::new_v4().simple().to_string();
            let expression = include_str!("../../core/preview/scripts/snapshot.js")
                .replace("__SNAPSHOT_ID__", &token);
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
                &format!(
                    "({})({x},{y})",
                    include_str!("../../core/preview/scripts/pick.js")
                ),
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
        Action::ClickRef { reference } => {
            let reference = serde_json::to_string(&reference).map_err(AppError::io)?;
            platform::query(&view,&format!("(()=>{{const [token,index]={reference}.split(':');const snapshot=window.__agentHubSnapshots?.get(token);const node=snapshot?.nodes[Number(index)];if(snapshot?.url!==location.href||!node?.isConnected)throw Error('Snapshot expired');node.scrollIntoView({{block:'center'}});node.click();return true}})()")).await
        }
        Action::FillRef { reference, value } => {
            if value.len() > 64 * 1024 {
                return Err(AppError::invalid_input("Input exceeds limit"));
            }
            let reference = serde_json::to_string(&reference).map_err(AppError::io)?;
            let value = serde_json::to_string(&value).map_err(AppError::io)?;
            platform::query(&view,&format!("(()=>{{const [token,index]={reference}.split(':');const snapshot=window.__agentHubSnapshots?.get(token);const node=snapshot?.nodes[Number(index)];if(snapshot?.url!==location.href||!node?.isConnected||node.disabled||node.readOnly)throw Error('Snapshot expired');node.focus();const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node),'value')?.set;if(setter)setter.call(node,{value});else if(node.isContentEditable)node.textContent={value};else throw Error('Element is not editable');node.dispatchEvent(new Event('input',{{bubbles:true}}));node.dispatchEvent(new Event('change',{{bubbles:true}}));return true}})()")).await
        }
        _ => Err(AppError::invalid_input(
            "This operation is unavailable for the native engine",
        )),
    }
}
