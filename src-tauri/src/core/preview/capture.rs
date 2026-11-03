//! Validate page-controlled extraction data before passing it to the app renderer.
use super::super::error::AppError;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Capture {
    selector: String,
    text: String,
    html: String,
    styles: BTreeMap<String, String>,
    bounds: Bounds,
    document_bounds: Bounds,
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    label: Option<String>,
}
#[derive(Deserialize, Serialize)]
struct Bounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}
pub fn normalize(value: Value, revision: String, url: String) -> Result<Value, AppError> {
    if value.is_null() {
        return Ok(Value::Null);
    }
    let mut capture: Capture = serde_json::from_value(value)
        .map_err(|_| AppError::invalid_input("Page returned invalid element data"))?;
    for bounds in [&capture.bounds, &capture.document_bounds] {
        if ![bounds.x, bounds.y, bounds.width, bounds.height]
            .into_iter()
            .all(|value| value.is_finite())
            || bounds.width < 0.
            || bounds.height < 0.
        {
            return Err(AppError::invalid_input(
                "Page returned invalid element bounds",
            ));
        }
    }
    capture.selector = capture.selector.chars().take(2000).collect();
    capture.text = capture.text.chars().take(2000).collect();
    capture.html = capture.html.chars().take(4096).collect();
    capture.role = capture.role.map(|value| value.chars().take(200).collect());
    capture.label = capture.label.map(|value| value.chars().take(500).collect());
    capture.styles = capture
        .styles
        .into_iter()
        .take(50)
        .map(|(key, value)| {
            (
                key.chars().take(64).collect(),
                value.chars().take(500).collect(),
            )
        })
        .collect();
    let mut value = serde_json::to_value(capture).map_err(AppError::io)?;
    value["revision"] = revision.into();
    value["url"] = url.into();
    Ok(value)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_page_controlled_objects_in_display_fields() {
        assert!(normalize(
            serde_json::json!({"selector":{"malicious":true}}),
            "revision".into(),
            "about:blank".into()
        )
        .is_err());
    }
}
