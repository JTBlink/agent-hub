//! Thin desktop bindings for the independent preview modules.
use crate::core::{
    error::AppError,
    preview::{self, browser::Action, runtime::BrowserProfile, Preview},
};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;
use tauri::State;

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
    CancelDownload {
        profile: String,
        id: String,
    },
    PrepareDelivery {
        text: String,
        images: Vec<String>,
    },
    Info,
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
    },
    Action {
        id: String,
        action: Action,
    },
    Close {
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
    preview: State<'_, Arc<Preview>>,
    request: PreviewRequest,
) -> Result<Value, AppError> {
    let preview = preview.inner().clone();
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
            PreviewRequest::Downloads => serde_json::to_value(preview.browsers.downloads()?),
            PreviewRequest::CancelDownload { profile, id } => {
                preview.browsers.cancel_download(&profile, &id)?;
                return Ok(Value::Null);
            }
            PreviewRequest::List => serde_json::to_value(preview.browsers.list()?),
            PreviewRequest::PrepareDelivery { text, images } => {
                serde_json::to_value(preview.packets.prepare(&text, &images)?)
            }
            PreviewRequest::Info => {
                preview.start_automation()?;
                serde_json::to_value(preview.browsers.info()?)
            }
            PreviewRequest::Create {
                profile,
                url,
                owner,
            } => serde_json::to_value(match owner {
                Some(owner) => preview.browsers.create_owned(&profile, &url, &owner)?,
                None => preview.browsers.create(&profile, &url)?,
            }),
            PreviewRequest::Frame { id, since } => {
                serde_json::to_value(preview.browsers.frame_since(&id, since)?)
            }
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
    let Some(file) = rfd::AsyncFileDialog::new()
        .add_filter("Preview documents", &["md", "markdown", "html", "htm"])
        .pick_file()
        .await
    else {
        return Ok(None);
    };
    let path = file.path().to_path_buf();
    let preview = preview.inner().clone();
    tauri::async_runtime::spawn_blocking(move || preview.open_document(&path).map(Some)).await?
}
#[tauri::command]
pub async fn preview_export(name: String, content: String, binary: bool) -> Result<bool, AppError> {
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
    tauri::async_runtime::spawn_blocking(move || {
        use base64::Engine;
        let bytes = if binary {
            base64::engine::general_purpose::STANDARD
                .decode(content)
                .map_err(AppError::io)?
        } else {
            content.into_bytes()
        };
        std::fs::write(path, bytes)?;
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
        let path = preview.browsers.download_path(&profile, &id)?;
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
