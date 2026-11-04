use super::{
    super::error::AppError,
    browser::{Browsers, Frame, Page, PageStatus},
};
use serde_json::json;
use std::time::{Duration, Instant};
impl Browsers {
    pub fn kernel(&self, id: &str) -> Result<serde_json::Value, AppError> {
        let page = self.page(id)?;
        let mut page = page
            .lock()
            .map_err(|_| AppError::internal("Browser page unavailable"))?;
        page.cdp.call("Browser.getVersion", json!({}))
    }
    pub fn frame(&self, id: &str) -> Result<Frame, AppError> {
        self.frame_since(id, None)
    }
    pub fn frame_since(&self, id: &str, since: Option<u64>) -> Result<Frame, AppError> {
        self.frame_with_cache(id, since, false)
    }
    pub fn quick_frame(&self, id: &str, since: Option<u64>) -> Result<Frame, AppError> {
        self.frame_with_cache(id, since, true)
    }
    fn frame_with_cache(
        &self,
        id: &str,
        since: Option<u64>,
        quick: bool,
    ) -> Result<Frame, AppError> {
        let page = self.page(id)?;
        let mut page = page
            .lock()
            .map_err(|_| AppError::internal("Browser page unavailable"))?;
        let result = (|| {
            page.cdp.sync_frame()?;
            if quick && page.cdp.dialog.is_none() {
                if let Some((at, info)) = &page.frame_info {
                    if at.elapsed() < Duration::from_millis(500) {
                        let metadata = page
                            .metadata
                            .lock()
                            .map_err(|_| AppError::internal("Browser metadata unavailable"))?;
                        if metadata.status == PageStatus::Gone {
                            return Err(AppError::not_found("PREVIEW_PAGE_GONE"));
                        }
                        let info = info.clone();
                        drop(metadata);
                        let version = page.cdp.frame_version;
                        return Ok(Frame {
                            image_mime: super::rendering::image_mime(
                                page.cdp.frame.as_deref().unwrap_or_default(),
                            ),
                            version,
                            image: if since == Some(version) {
                                String::new()
                            } else {
                                page.cdp.frame.clone().unwrap_or_default()
                            },
                            info,
                            events: page.cdp.events.drain(..).collect(),
                        });
                    }
                }
            }
            let identity = if page.cdp.dialog.is_some() {
                None
            } else {
                match page.identity() {
                    Ok(identity) => Some(identity),
                    Err(error) if page.cdp.dialog.is_none() => return Err(error),
                    Err(_) => None,
                }
            };
            if page.cdp.dialog.is_some() {
                return dialog_frame(&mut page, since);
            }
            let (revision, url) =
                identity.ok_or_else(|| AppError::network("Browser document unavailable"))?;
            let mut info = if page.cdp.dialog.is_some() {
                json!({"title":"", "ready":"interactive"})
            } else {
                page.cdp.evaluate("({url:location.href,title:document.title,revision:String(performance.timeOrigin),ready:document.readyState,width:innerWidth,height:innerHeight,scrollX,scrollY,dpr:devicePixelRatio})")?
            };
            if !info.is_object() {
                return Err(AppError::network("Page metadata unavailable"));
            }
            info["execution"] = json!(
                page.metadata
                    .lock()
                    .map_err(|_| AppError::internal("Browser metadata unavailable"))?
                    .execution
            );
            info["url"] = json!(url);
            info["revision"] = json!(revision);
            info["title"] = json!(info["title"]
                .as_str()
                .unwrap_or("")
                .chars()
                .take(500)
                .collect::<String>());
            info["ready"] = json!(info["ready"].as_str().unwrap_or("loading"));
            info["layoutWidth"] = info["width"].clone();
            info["layoutHeight"] = info["height"].clone();
            info["width"] = json!(page.width);
            info["height"] = json!(page.height);
            info["chooser"] = json!(page.cdp.chooser);
            info["dialog"] = json!(page.cdp.dialog);
            info["history"] = page.cdp.call("Page.getNavigationHistory", json!({}))?;
            if page.cdp.frame.is_none() {
                let clip = json!({"x":0,"y":0,"width":page.width,"height":page.height,"scale":1});
                let result = page.cdp.call(
                    "Page.captureScreenshot",
                    json!({"format":"png","captureBeyondViewport":false,"clip":clip}),
                )?;
                let image = result["data"]
                    .as_str()
                    .filter(|data| data.len() <= super::rendering::MAX_FRAME_BYTES)
                    .ok_or_else(|| AppError::network("Browser frame unavailable"))?
                    .to_owned();
                page.cdp.frame = Some(image);
                page.cdp.frame_version += 1;
            }
            let version = page.cdp.frame_version;
            let image = if since == Some(version) {
                String::new()
            } else {
                page.cdp.frame.clone().unwrap_or_default()
            };
            if page.identity()?.0 != revision {
                return Err(AppError::cancelled("Page changed during capture"));
            }
            info["chooser"] = json!(page.cdp.chooser);
            info["dialog"] = json!(page.cdp.dialog);
            let events = page.cdp.events.drain(..).collect();
            if let Ok(mut metadata) = page.metadata.lock() {
                if metadata.status == PageStatus::Gone {
                    return Err(AppError::not_found("PREVIEW_PAGE_GONE"));
                }
                metadata.url = info["url"].as_str().unwrap_or("about:blank").into();
                metadata.title = info["title"].as_str().unwrap_or("").into();
                metadata.revision = revision;
                metadata.status = PageStatus::Connected;
            }
            page.frame_info = Some((Instant::now(), info.clone()));
            Ok(Frame {
                image_mime: super::rendering::image_mime(
                    page.cdp.frame.as_deref().unwrap_or_default(),
                ),
                version,
                image,
                info,
                events,
            })
        })();
        if result.is_err() {
            if let Ok(mut metadata) = page.metadata.lock() {
                if metadata.status != PageStatus::Gone {
                    metadata.status = PageStatus::Unverified;
                }
            }
        }
        if result.is_err() && page.cdp.dialog.is_some() {
            return dialog_frame(&mut page, since);
        }
        result
    }
}
fn dialog_frame(page: &mut Page, since: Option<u64>) -> Result<Frame, AppError> {
    let metadata = page
        .metadata
        .lock()
        .map_err(|_| AppError::internal("Browser metadata unavailable"))?
        .clone();
    if metadata.status == PageStatus::Gone {
        return Err(AppError::not_found("PREVIEW_PAGE_GONE"));
    }
    let info = json!({"execution":metadata.execution,"url":metadata.url,"title":metadata.title,"revision":metadata.revision,"ready":"interactive","width":page.width,"height":page.height,"dialog":page.cdp.dialog,"chooser":page.cdp.chooser});
    let version = page.cdp.frame_version;
    let image = if since == Some(version) {
        String::new()
    } else {
        page.cdp.frame.clone().unwrap_or_default()
    };
    Ok(Frame {
        image_mime: super::rendering::image_mime(page.cdp.frame.as_deref().unwrap_or_default()),
        version,
        image,
        info,
        events: page.cdp.events.drain(..).collect(),
    })
}

#[cfg(test)]
mod tests;
