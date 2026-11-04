//! Thin desktop bindings for the independent preview modules.
use crate::core::{
    error::AppError,
    preview::{self, browser::Action, runtime::BrowserProfile, Preview},
};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;
use tauri::{Manager, State};

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PreviewRequest {
    CookiePrepare {
        id: String,
        revision: String,
        text: String,
    },
    CookieBrowser {
        id: String,
        revision: String,
        endpoint: String,
    },
    CookieApply {
        import_id: String,
        domains: Vec<String>,
        replace: bool,
    },
    CookieCancel {
        import_id: String,
    },
    CaptureRendered {
        html: String,
        width: u32,
        height: u32,
        profile: String,
        full: bool,
        clip: Option<Value>,
    },
    Downloads,
    FetchDownload {
        profile: String,
        id: String,
    },
    CancelTransfer {
        profile: String,
        id: String,
    },
    ForgetDownload {
        profile: String,
        id: String,
    },
    CancelDownload {
        profile: String,
        id: String,
    },
    PrepareDelivery {
        text: String,
        images: Vec<String>,
    },
    Info,
    KillProfileProcess {
        profile: String,
    },
    Kernel {
        id: String,
    },
    List,
    Create {
        profile: String,
        url: String,
        owner: Option<String>,
    },
    Frame {
        id: String,
        #[serde(default)]
        since: Option<u64>,
        #[serde(default)]
        quick: bool,
    },
    Action {
        id: String,
        action: Action,
    },
    Close {
        id: String,
    },
    Reopen {
        id: String,
    },
    Reconnect {
        id: String,
    },
    DeleteProfile {
        id: String,
    },
    SaveProfile {
        profile: BrowserProfile,
    },
    OpenLink {
        id: String,
        href: String,
    },
    ResourceLink {
        id: String,
        href: String,
    },
    ReadDocument {
        id: String,
    },
    SaveDocument {
        id: String,
        content: String,
        revision: String,
    },
    CloseDocument {
        id: String,
    },
}
#[tauri::command]
pub async fn preview_request(
    app: tauri::AppHandle,
    preview: State<'_, Arc<Preview>>,
    request: PreviewRequest,
) -> Result<Value, AppError> {
    let preview = preview.inner().clone();
    let native_downloads = app
        .state::<super::preview_native::NativeViews>()
        .downloads
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        let value = match request {
            PreviewRequest::CookiePrepare { id, revision, text } => {
                if text.len() > preview::cookies::policy::MAX_BYTES {
                    return Err(AppError::invalid_input("Cookie text exceeds 2 MiB"));
                }
                let value = serde_json::from_str(&text)
                    .map_err(|_| AppError::invalid_input("Invalid cookie JSON"))?;
                serde_json::to_value(preview.cookie_imports.prepare(
                    &preview.browsers,
                    &id,
                    &revision,
                    value,
                )?)
            }
            PreviewRequest::CookieBrowser {
                id,
                revision,
                endpoint,
            } => {
                let value = preview::cookies::sources::browser(&endpoint)?;
                serde_json::to_value(preview.cookie_imports.prepare(
                    &preview.browsers,
                    &id,
                    &revision,
                    value,
                )?)
            }
            PreviewRequest::CookieApply {
                import_id,
                domains,
                replace,
            } => serde_json::to_value(preview.cookie_imports.apply(
                &preview.browsers,
                &import_id,
                domains,
                replace,
            )?),
            PreviewRequest::CookieCancel { import_id } => {
                preview.cookie_imports.cancel(&import_id);
                return Ok(Value::Null);
            }
            PreviewRequest::CaptureRendered {
                html,
                width,
                height,
                profile,
                full,
                clip,
            } => serde_json::to_value(
                preview.capture_rendered(&html, width, height, &profile, full, clip)?,
            ),
            PreviewRequest::FetchDownload { profile, id } => {
                preview.browsers.fetch_download(&profile, &id)?;
                return Ok(Value::Null);
            }
            PreviewRequest::CancelTransfer { profile, id } => {
                preview.browsers.cancel_transfer(&profile, &id)?;
                return Ok(Value::Null);
            }
            PreviewRequest::Downloads => {
                let mut items = preview
                    .browsers
                    .downloads()?
                    .into_iter()
                    .map(serde_json::to_value)
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(AppError::io)?;
                items.extend(native_downloads.snapshot()?);
                Ok(Value::Array(items))
            }
            PreviewRequest::ForgetDownload { profile, id } => {
                if profile == "native" {
                    native_downloads.forget(&id)?;
                } else {
                    preview.browsers.forget_download(&profile, &id)?;
                }
                return Ok(Value::Null);
            }
            PreviewRequest::CancelDownload { profile, id } => {
                if profile == "native" {
                    return Err(AppError::invalid_input(
                        "The system WebView does not provide download cancellation",
                    ));
                }
                preview.browsers.cancel_download(&profile, &id)?;
                return Ok(Value::Null);
            }
            PreviewRequest::Reopen { id } => {
                preview.browsers.reopen(&id)?;
                return Ok(Value::Null);
            }
            PreviewRequest::Reconnect { id } => {
                preview.browsers.reconnect(&id)?;
                return Ok(Value::Null);
            }
            PreviewRequest::Kernel { id } => return preview.browsers.kernel(&id),
            PreviewRequest::List => serde_json::to_value(preview.browsers.list()?),
            PreviewRequest::PrepareDelivery { text, images } => {
                serde_json::to_value(preview.packets.prepare(&text, &images)?)
            }
            PreviewRequest::Info => {
                preview.start_automation()?;
                serde_json::to_value(preview.browsers.info()?)
            }
            PreviewRequest::KillProfileProcess { profile } => {
                preview.browsers.kill_profile_process(&profile)?;
                return Ok(Value::Null);
            }
            PreviewRequest::Create {
                profile,
                url,
                owner,
            } => serde_json::to_value(match owner {
                Some(owner) => preview.browsers.create_owned(&profile, &url, &owner)?,
                None => preview.browsers.create(&profile, &url)?,
            }),
            PreviewRequest::Frame { id, since, quick } => serde_json::to_value(if quick {
                preview.browsers.quick_frame(&id, since)?
            } else {
                preview.browsers.frame_since(&id, since)?
            }),
            PreviewRequest::Action { id, action } => return preview.browsers.action(&id, action),
            PreviewRequest::Close { id } => {
                preview.browsers.close(&id)?;
                return Ok(Value::Null);
            }
            PreviewRequest::DeleteProfile { id } => {
                preview.browsers.delete_profile(&id)?;
                return Ok(Value::Null);
            }
            PreviewRequest::SaveProfile { profile } => {
                preview.browsers.save_profile(profile)?;
                return Ok(Value::Null);
            }
            PreviewRequest::OpenLink { id, href } => {
                serde_json::to_value(preview.open_link(&id, &href)?)
            }
            PreviewRequest::ResourceLink { id, href } => {
                serde_json::to_value(preview.resource_link(&id, &href)?)
            }
            PreviewRequest::ReadDocument { id } => {
                serde_json::to_value(preview.documents.read(&id)?)
            }
            PreviewRequest::SaveDocument {
                id,
                content,
                revision,
            } => serde_json::to_value(preview.documents.save(&id, &content, &revision)?),
            PreviewRequest::CloseDocument { id } => {
                preview.documents.close(&id);
                return Ok(Value::Null);
            }
        };
        value.map_err(|error| AppError::internal(error.to_string()))
    })
    .await?
}
#[tauri::command]
pub async fn preview_pick_document(
    preview: State<'_, Arc<Preview>>,
) -> Result<Option<preview::OpenedDocument>, AppError> {
    let Some(file) = rfd::AsyncFileDialog::new().pick_file().await else {
        return Ok(None);
    };
    let path = file.path().to_path_buf();
    let preview = preview.inner().clone();
    tauri::async_runtime::spawn_blocking(move || preview.open_document(&path).map(Some)).await?
}
#[tauri::command]
pub async fn preview_export(
    preview: State<'_, Arc<Preview>>,
    name: String,
    content: String,
    binary: bool,
    expected: Option<preview::export::ExpectedPage>,
) -> Result<bool, AppError> {
    if content.len() > 24 * 1024 * 1024 || name.len() > 200 || name.contains(['/', '\\']) {
        return Err(AppError::invalid_input(
            "Export exceeds the supported limit",
        ));
    }
    let Some(file) = rfd::AsyncFileDialog::new()
        .set_file_name(&name)
        .save_file()
        .await
    else {
        return Ok(false);
    };
    let path = file.path().to_path_buf();
    let preview = preview.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        use base64::Engine;
        let bytes = if binary {
            base64::engine::general_purpose::STANDARD
                .decode(content)
                .map_err(AppError::io)?
        } else {
            content.into_bytes()
        };
        preview::export::write(&preview.browsers, &path, &bytes, expected.as_ref())?;
        Ok(true)
    })
    .await?
}

#[tauri::command]
pub async fn preview_download_file(
    preview: State<'_, Arc<Preview>>,
    app: tauri::AppHandle,
    profile: String,
    id: String,
    reveal: bool,
) -> Result<(), AppError> {
    let preview = preview.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let path = if profile == "native" {
            app.state::<super::preview_native::NativeViews>()
                .downloads
                .path(&id)?
        } else {
            preview.browsers.download_path(&profile, &id)?
        };
        if reveal {
            tauri_plugin_opener::reveal_item_in_dir(path).map_err(AppError::io)
        } else {
            use tauri_plugin_opener::OpenerExt;
            app.opener()
                .open_path(path.to_string_lossy(), None::<&str>)
                .map_err(AppError::io)
        }
    })
    .await?
}

#[tauri::command]
pub async fn preview_open_project(
    preview: State<'_, Arc<Preview>>,
    store: State<'_, Arc<crate::core::skill_store::SkillStore>>,
    project_id: String,
    worktree_path: String,
    relative_path: String,
) -> Result<preview::OpenedDocument, AppError> {
    let preview = preview.inner().clone();
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root =
            crate::core::project_worktrees::directory(&store, &project_id, Some(&worktree_path))
                .map_err(AppError::io)?;
        preview.open_at(&root, &relative_path)
    })
    .await?
}

#[tauri::command]
pub async fn preview_upload(
    preview: State<'_, Arc<Preview>>,
    id: String,
    revision: String,
    token: String,
    multiple: bool,
) -> Result<bool, AppError> {
    let dialog = rfd::AsyncFileDialog::new();
    let paths = if multiple {
        dialog.pick_files().await.map(|files| {
            files
                .into_iter()
                .map(|file| file.path().to_path_buf())
                .collect::<Vec<_>>()
        })
    } else {
        dialog
            .pick_file()
            .await
            .map(|file| vec![file.path().to_path_buf()])
    };
    let Some(paths) = paths else {
        return Ok(false);
    };
    let preview = preview.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        preview
            .browsers
            .upload_files(&id, &revision, &token, &paths)
    })
    .await??;
    Ok(true)
}
