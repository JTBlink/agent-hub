//! Validate page-controlled extraction data before passing it to the app renderer.
use super::super::error::AppError;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Capture {
    selector: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    dom_path: Vec<String>,
    #[serde(default)]
    viewport: Option<Viewport>,
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
#[serde(rename_all = "camelCase")]
struct Viewport {
    width: f64,
    height: f64,
    dpr: f64,
    scroll_x: f64,
    scroll_y: f64,
    #[serde(default = "unit_scale")]
    scale: f64,
}
fn unit_scale() -> f64 {
    1.
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
    if let Some(viewport) = &capture.viewport {
        if ![
            viewport.width,
            viewport.height,
            viewport.dpr,
            viewport.scroll_x,
            viewport.scroll_y,
            viewport.scale,
        ]
        .into_iter()
        .all(|value| value.is_finite())
            || viewport.width <= 0.
            || viewport.height <= 0.
            || !(0.1..=16.).contains(&viewport.dpr)
            || !(0.1..=16.).contains(&viewport.scale)
        {
            return Err(AppError::invalid_input(
                "Page returned invalid viewport data",
            ));
        }
    }
    capture.title = capture.title.chars().take(500).collect();
    capture.dom_path = capture
        .dom_path
        .into_iter()
        .take(32)
        .map(|item| item.chars().take(200).collect())
        .collect();
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
    #[test]
    fn preserves_bounded_context_and_rejects_invalid_viewport() {
        let mut value = serde_json::json!({"selector":"p","title":"Page","domPath":vec!["x".repeat(300);40],"text":"Text","html":"<p>Text</p>","styles":{},"bounds":{"x":0,"y":0,"width":100,"height":20},"documentBounds":{"x":0,"y":120,"width":100,"height":20},"viewport":{"width":800,"height":600,"dpr":2,"scrollX":0,"scrollY":120,"scale":1}});
        let result = normalize(
            value.clone(),
            "rev".into(),
            "https://example.invalid".into(),
        )
        .unwrap();
        assert_eq!(result["title"], "Page");
        assert_eq!(result["viewport"]["scrollY"], 120.);
        assert_eq!(result["domPath"].as_array().unwrap().len(), 32);
        assert_eq!(result["domPath"][0].as_str().unwrap().len(), 200);
        value["viewport"]["dpr"] = serde_json::json!(-1);
        assert!(normalize(value, "rev".into(), "https://example.invalid".into()).is_err());
    }
}
