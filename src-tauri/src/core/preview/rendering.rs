//! Shared bounds and pixel geometry for the Chromium frame transport.
use serde_json::{json, Value};

pub(super) const MAX_FRAME_BYTES: usize = 24 * 1024 * 1024;
pub(super) const MAX_FRAME_WIDTH: u32 = 7680;
pub(super) const MAX_FRAME_HEIGHT: u32 = 4320;

pub(super) fn pixel_size(width: u32, height: u32, density: f64) -> (u32, u32) {
    (
        (f64::from(width) * density).round() as u32,
        (f64::from(height) * density).round() as u32,
    )
}

pub(super) fn metrics(width: u32, height: u32, mobile: bool, density: f64) -> Value {
    json!({"width": width, "height": height, "deviceScaleFactor": density, "mobile": mobile})
}

pub(super) fn stream_params() -> Value {
    json!({"format":"jpeg", "quality":90, "maxWidth":MAX_FRAME_WIDTH, "maxHeight":MAX_FRAME_HEIGHT, "everyNthFrame":1})
}

pub(super) fn image_mime(image: &str) -> &'static str {
    if image.starts_with("/9j/") {
        "image/jpeg"
    } else {
        "image/png"
    }
}
