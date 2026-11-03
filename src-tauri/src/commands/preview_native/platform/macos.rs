use super::*;
use objc2::{runtime::AnyObject, MainThreadMarker};
use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
use objc2_foundation::{
    NSDictionary, NSError, NSJSONSerialization, NSJSONWritingOptions, NSString,
};
use objc2_web_kit::{WKSnapshotConfiguration, WKWebView};
use std::sync::Mutex;

pub async fn query(view: &tauri::Webview, expression: &str) -> Result<Value, AppError> {
    if expression.len() > 256 * 1024 {
        return Err(AppError::invalid_input("Native expression exceeds limit"));
    }
    let script = format!("(()=>{{try{{return {{ok:true,value:({expression})}}}}catch(error){{return {{ok:false,error:String(error)}}}}}})()");
    let (sender, receiver) = tokio::sync::oneshot::channel();
    view.with_webview(move |platform| {
        let sender = Mutex::new(Some(sender));
        let callback = block2::RcBlock::new(move |value: *mut AnyObject, error: *mut NSError| {
            let result = (|| {
                if !error.is_null() || value.is_null() {
                    return Err(AppError::network(
                        "Native script failed or its result cannot be serialized",
                    ));
                }
                // WebKit's callback owns these objects for this invocation; no pointer escapes it.
                let data = unsafe {
                    NSJSONSerialization::dataWithJSONObject_options_error(
                        &*value,
                        NSJSONWritingOptions::FragmentsAllowed,
                    )
                }
                .map_err(AppError::io)?;
                let bytes = data.to_vec();
                if bytes.len() > 2 * 1024 * 1024 {
                    return Err(AppError::invalid_input("Native page result exceeds limit"));
                }
                let mut result: Value = serde_json::from_slice(&bytes).map_err(AppError::io)?;
                if result["ok"] != true {
                    return Err(AppError::network(
                        result["error"].as_str().unwrap_or("Native script failed"),
                    ));
                }
                Ok(result["value"].take())
            })();
            if let Ok(mut sender) = sender.lock() {
                if let Some(sender) = sender.take() {
                    let _ = sender.send(result);
                }
            }
        });
        // Tauri executes with_webview on the main thread and keeps the WKWebView alive.
        unsafe {
            let wk: &WKWebView = &*platform.inner().cast();
            wk.evaluateJavaScript_completionHandler(&NSString::from_str(&script), Some(&callback));
        }
    })
    .map_err(AppError::io)?;
    super::receive(receiver).await
}
pub async fn snapshot(view: &tauri::Webview) -> Result<Vec<u8>, AppError> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    view.with_webview(move |platform| {
        let sender = Mutex::new(Some(sender));
        let callback = block2::RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
            let result = (|| {
                if !error.is_null() || image.is_null() {
                    return Err(AppError::network("Native snapshot unavailable"));
                }
                let image = unsafe { &*image };
                let tiff = image
                    .TIFFRepresentation()
                    .ok_or_else(|| AppError::network("Native image unavailable"))?;
                let bitmap = NSBitmapImageRep::imageRepWithData(&tiff)
                    .ok_or_else(|| AppError::network("Native image conversion failed"))?;
                let data = unsafe {
                    bitmap.representationUsingType_properties(
                        NSBitmapImageFileType::PNG,
                        &NSDictionary::new(),
                    )
                }
                .ok_or_else(|| AppError::network("Native PNG conversion failed"))?;
                if data.len() > 18 * 1024 * 1024 {
                    return Err(AppError::invalid_input("Native screenshot exceeds limit"));
                }
                Ok(data.to_vec())
            })();
            if let Ok(mut sender) = sender.lock() {
                if let Some(sender) = sender.take() {
                    let _ = sender.send(result);
                }
            }
        });
        let marker =
            MainThreadMarker::new().expect("Tauri with_webview must run on the main thread");
        unsafe {
            let wk: &WKWebView = &*platform.inner().cast();
            let config = WKSnapshotConfiguration::new(marker);
            config.setAfterScreenUpdates(true);
            // The existing viewport width is retained; WebKit handles its display scale.
            wk.takeSnapshotWithConfiguration_completionHandler(Some(&config), &callback);
        }
    })
    .map_err(AppError::io)?;
    super::receive(receiver).await
}

pub async fn user_agent(view: &tauri::Webview, value: Option<String>) -> Result<(), AppError> {
    super::super::profile::validate_ua(value.as_deref())?;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    view.with_webview(move |platform| {
        let value = value.as_deref().map(NSString::from_str);
        unsafe {
            let wk: &WKWebView = &*platform.inner().cast();
            wk.setCustomUserAgent(value.as_deref());
        }
        let _ = sender.send(Ok(()));
    })
    .map_err(AppError::io)?;
    super::receive(receiver).await
}
