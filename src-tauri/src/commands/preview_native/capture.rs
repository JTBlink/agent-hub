//! Capture the actual native surface; large areas use bounded viewport tiles.
use super::{control, platform};
use crate::core::error::AppError;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
#[derive(Clone, Copy, Debug)]
struct Rect {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}
fn number(info: &Value, key: &str) -> Result<u32, AppError> {
    let value = info[key]
        .as_f64()
        .filter(|value| value.is_finite() && *value >= 0.0 && *value <= 100_000.0)
        .ok_or_else(|| AppError::invalid_input("Invalid native capture bounds"))?;
    Ok(value.ceil() as u32)
}
fn area(info: &Value, full: bool, clip: Option<&Value>) -> Result<Rect, AppError> {
    let rect = if let Some(clip) = clip {
        Rect {
            x: number(clip, "x")?,
            y: number(clip, "y")?,
            width: number(clip, "width")?,
            height: number(clip, "height")?,
        }
    } else if full {
        Rect {
            x: 0,
            y: 0,
            width: number(info, "documentWidth")?,
            height: number(info, "documentHeight")?,
        }
    } else {
        Rect {
            x: number(info, "scrollX")?,
            y: number(info, "scrollY")?,
            width: number(info, "width")?,
            height: number(info, "height")?,
        }
    };
    if rect.width == 0
        || rect.height == 0
        || rect.width > 20000
        || rect.height > 20000
        || u64::from(rect.width) * u64::from(rect.height) > 32_000_000
    {
        return Err(AppError::invalid_input("Native capture exceeds limit"));
    }
    Ok(rect)
}
pub(super) async fn screenshot(
    view: &tauri::Webview,
    full: bool,
    clip: Option<Value>,
    expected: Option<String>,
) -> Result<Value, AppError> {
    let info = control::metadata(view).await?;
    let revision = info["revision"]
        .as_str()
        .ok_or_else(|| AppError::network("Native document unavailable"))?
        .to_owned();
    if expected
        .as_ref()
        .is_some_and(|expected| expected != &revision)
    {
        return Err(AppError::cancelled("PREVIEW_CONTEXT_CHANGED"));
    }
    let rect = area(&info, full, clip.as_ref())?;
    let width = number(&info, "width")?;
    let height = number(&info, "height")?;
    if width == 0 || height == 0 {
        return Err(AppError::network("Native viewport is hidden"));
    }
    let old_x = info["scrollX"].as_f64().unwrap_or(0.0);
    let old_y = info["scrollY"].as_f64().unwrap_or(0.0);
    platform::query(view,"(()=>{const s=window.__agentHubNativePreview;if(s){s.captureBusy=true;s.oldScrollBehavior=document.documentElement.style.scrollBehavior}document.documentElement.style.scrollBehavior='auto';return true})()").await?;
    let result = tiles(view, rect, width, height, &revision).await;
    // Restore only the captured document, never a replacement navigation.
    let encoded = serde_json::to_string(&revision).map_err(AppError::io)?;
    let restore=platform::query(view,&format!("(()=>{{if(({}) .revision!=={encoded})return false;scrollTo({old_x},{old_y});const s=window.__agentHubNativePreview;if(s){{document.documentElement.style.scrollBehavior=s.oldScrollBehavior||'';s.captureBusy=false}}return true}})()",control::METADATA)).await;
    let bytes = result?;
    if restore? != true {
        return Err(AppError::cancelled("PREVIEW_CONTEXT_CHANGED"));
    }
    control::verify(view, &revision).await?;
    Ok(json!({"data":STANDARD.encode(bytes)}))
}
async fn tiles(
    view: &tauri::Webview,
    rect: Rect,
    width: u32,
    height: u32,
    revision: &str,
) -> Result<Vec<u8>, AppError> {
    let mut output = image::RgbaImage::new(rect.width, rect.height);
    let started = std::time::Instant::now();
    let mut count = 0;
    let mut y = 0;
    while y < rect.height {
        let mut x = 0;
        let mut row_height = rect.height - y;
        while x < rect.width {
            count += 1;
            if count > 128 || started.elapsed() > std::time::Duration::from_secs(30) {
                return Err(AppError::invalid_input(
                    "Native capture exceeds the time or tile limit",
                ));
            }
            let desired_x = rect.x + x;
            let desired_y = rect.y + y;
            platform::query(view, &format!("(scrollTo({desired_x},{desired_y}),true)")).await?;
            let current = control::verify(view, revision).await?;
            if number(&current, "width")? != width || number(&current, "height")? != height {
                return Err(AppError::cancelled(
                    "Native viewport changed during capture",
                ));
            }
            let scroll_x = number(&current, "scrollX")?;
            let scroll_y = number(&current, "scrollY")?;
            let left = desired_x
                .checked_sub(scroll_x)
                .ok_or_else(|| AppError::cancelled("Page moved during capture"))?;
            let top = desired_y
                .checked_sub(scroll_y)
                .ok_or_else(|| AppError::cancelled("Page moved during capture"))?;
            if left >= width || top >= height {
                return Err(AppError::invalid_input(
                    "Element is outside the captureable document",
                ));
            }
            let tile_width = (width - left).min(rect.width - x);
            let tile_height = (height - top).min(rect.height - y);
            row_height = row_height.min(tile_height);
            let bytes = platform::snapshot(view).await?;
            let size = image::ImageReader::with_format(
                std::io::Cursor::new(&bytes),
                image::ImageFormat::Png,
            )
            .into_dimensions()
            .map_err(AppError::io)?;
            if u64::from(size.0) * u64::from(size.1) > 32_000_000 {
                return Err(AppError::invalid_input(
                    "Native viewport image exceeds limit",
                ));
            }
            let bitmap = image::load_from_memory_with_format(&bytes, image::ImageFormat::Png)
                .map_err(AppError::io)?
                .to_rgba8();
            let bitmap = image::imageops::resize(
                &bitmap,
                width,
                height,
                image::imageops::FilterType::Triangle,
            );
            let tile =
                image::imageops::crop_imm(&bitmap, left, top, tile_width, tile_height).to_image();
            image::imageops::replace(&mut output, &tile, i64::from(x), i64::from(y));
            x += tile_width;
        }
        y += row_height;
    }
    let mut bytes = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(output)
        .write_to(&mut bytes, image::ImageFormat::Png)
        .map_err(AppError::io)?;
    if bytes.get_ref().len() > 18 * 1024 * 1024 {
        return Err(AppError::invalid_input("Native screenshot exceeds limit"));
    }
    Ok(bytes.into_inner())
}
#[cfg(test)]
mod tests;
