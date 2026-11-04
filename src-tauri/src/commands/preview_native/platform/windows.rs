//! WebView2 COM callbacks stay on the owning UI thread; public operations share one contract.
use super::*;
use ::windows::core::{Interface, BOOL, HSTRING, PWSTR};
use ::windows::Win32::System::Com::{
    IStream, StructuredStorage::CreateStreamOnHGlobal, STATFLAG_NONAME, STATSTG, STREAM_SEEK_SET,
};
use std::sync::{Arc, Mutex};
use webview2_com::Microsoft::Web::WebView2::Win32::*;
use webview2_com::{
    CapturePreviewCompletedHandler, CoTaskMemPWSTR, ExecuteScriptWithResultCompletedHandler,
};

type Reply<T> = Arc<Mutex<Option<tokio::sync::oneshot::Sender<Result<T, AppError>>>>>;
fn send<T>(reply: &Reply<T>, result: Result<T, AppError>) {
    if let Ok(mut slot) = reply.lock() {
        if let Some(sender) = slot.take() {
            let _ = sender.send(result);
        }
    }
}
unsafe fn text(
    read: impl FnOnce(*mut PWSTR) -> ::windows::core::Result<()>,
) -> Result<String, AppError> {
    let mut value = PWSTR::null();
    read(&mut value).map_err(AppError::io)?;
    Ok(CoTaskMemPWSTR::from(value).to_string())
}

pub async fn query(view: &tauri::Webview, expression: &str) -> Result<Value, AppError> {
    execute(view, script::query(expression)?, true).await
}
pub async fn evaluate(view: &tauri::Webview, expression: &str) -> Result<Value, AppError> {
    script::validate(expression)?;
    execute(view, expression.into(), false).await
}
async fn execute(view: &tauri::Webview, source: String, wrapped: bool) -> Result<Value, AppError> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let reply = Arc::new(Mutex::new(Some(sender)));
    view.with_webview(move |platform| {
        let completion = reply.clone();
        let result = (|| -> Result<(), AppError> {
            unsafe {
                let core = platform
                    .controller()
                    .CoreWebView2()
                    .map_err(AppError::io)?
                    .cast::<ICoreWebView2_21>()
                    .map_err(|_| {
                        AppError::invalid_input("Update WebView2 to enable native inspection")
                    })?;
                core.ExecuteScriptWithResult(
                    &HSTRING::from(source),
                    &ExecuteScriptWithResultCompletedHandler::create(Box::new(
                        move |status, value| {
                            let result = (|| {
                                status.map_err(AppError::io)?;
                                let value = value.ok_or_else(|| {
                                    AppError::network("Native script result unavailable")
                                })?;
                                let mut success = BOOL::default();
                                value.Succeeded(&mut success).map_err(AppError::io)?;
                                if !success.as_bool() {
                                    let exception = value.Exception().map_err(AppError::io)?;
                                    return Err(AppError::network(text(|out| {
                                        exception.Message(out)
                                    })?));
                                }
                                script::decode(&text(|out| value.ResultAsJson(out))?, wrapped)
                            })();
                            send(&completion, result);
                            Ok(())
                        },
                    )),
                )
                .map_err(AppError::io)?;
            }
            Ok(())
        })();
        if let Err(error) = result {
            send(&reply, Err(error));
        }
    })
    .map_err(AppError::io)?;
    super::receive(receiver).await
}
pub async fn snapshot(view: &tauri::Webview) -> Result<Vec<u8>, AppError> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let reply = Arc::new(Mutex::new(Some(sender)));
    view.with_webview(move |platform| {
        let completion = reply.clone();
        let result = (|| -> Result<(), AppError> {
            unsafe {
                let core = platform.controller().CoreWebView2().map_err(AppError::io)?;
                let stream =
                    CreateStreamOnHGlobal(Default::default(), true).map_err(AppError::io)?;
                let output: IStream = stream.clone();
                core.CapturePreview(
                    COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
                    &stream,
                    &CapturePreviewCompletedHandler::create(Box::new(move |status| {
                        let result = (|| {
                            status.map_err(AppError::io)?;
                            let mut stat = STATSTG::default();
                            output
                                .Stat(&mut stat, STATFLAG_NONAME)
                                .map_err(AppError::io)?;
                            if stat.cbSize > 18 * 1024 * 1024 {
                                return Err(AppError::invalid_input(
                                    "Native screenshot exceeds limit",
                                ));
                            }
                            output
                                .Seek(0, STREAM_SEEK_SET, None)
                                .map_err(AppError::io)?;
                            let mut bytes = vec![0; stat.cbSize as usize];
                            let mut read = 0;
                            output
                                .Read(
                                    bytes.as_mut_ptr().cast(),
                                    bytes.len() as u32,
                                    Some(&mut read),
                                )
                                .ok()
                                .map_err(AppError::io)?;
                            bytes.truncate(read as usize);
                            Ok(bytes)
                        })();
                        send(&completion, result);
                        Ok(())
                    })),
                )
                .map_err(AppError::io)?;
            }
            Ok(())
        })();
        if let Err(error) = result {
            send(&reply, Err(error));
        }
    })
    .map_err(AppError::io)?;
    super::receive(receiver).await
}
pub async fn user_agent(view: &tauri::Webview, value: Option<String>) -> Result<(), AppError> {
    super::super::profile::validate_ua(value.as_deref())?;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    view.with_webview(move |platform| {
        let result = (|| unsafe {
            let settings = platform
                .controller()
                .CoreWebView2()
                .map_err(AppError::io)?
                .Settings()
                .map_err(AppError::io)?
                .cast::<ICoreWebView2Settings2>()
                .map_err(AppError::io)?;
            settings
                .SetUserAgent(&HSTRING::from(value.unwrap_or_default()))
                .map_err(AppError::io)
        })();
        let _ = sender.send(result);
    })
    .map_err(AppError::io)?;
    super::receive(receiver).await
}
pub async fn theme(view: &tauri::Webview, dark: bool, _system: bool) -> Result<(), AppError> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    view.with_webview(move |platform| {
        let result = (|| unsafe {
            let profile = platform
                .controller()
                .CoreWebView2()
                .map_err(AppError::io)?
                .cast::<ICoreWebView2_13>()
                .map_err(AppError::io)?
                .Profile()
                .map_err(AppError::io)?;
            profile
                .SetPreferredColorScheme(if dark {
                    COREWEBVIEW2_PREFERRED_COLOR_SCHEME_DARK
                } else {
                    COREWEBVIEW2_PREFERRED_COLOR_SCHEME_LIGHT
                })
                .map_err(AppError::io)
        })();
        let _ = sender.send(result);
    })
    .map_err(AppError::io)?;
    super::receive(receiver).await
}
