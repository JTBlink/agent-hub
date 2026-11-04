//! Renderer-independent page operation contract.
use serde::Deserialize;
use serde_json::Value;
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Action {
    SetTheme {
        dark: bool,
        #[serde(default)]
        system: bool,
    },
    VerifyRevision {
        expected_revision: String,
    },
    HandleDialog {
        accept: bool,
        prompt: Option<String>,
    },
    CancelUpload {
        token: String,
    },
    InspectRef {
        reference: String,
    },
    ClickRef {
        reference: String,
    },
    FillRef {
        reference: String,
        value: String,
    },
    Navigate {
        url: String,
    },
    Reload {
        hard: bool,
    },
    Stop,
    Back,
    Forward,
    Resize {
        width: u32,
        height: u32,
        mobile: bool,
    },
    Mouse {
        x: f64,
        y: f64,
        event: String,
        button: Option<String>,
        delta_x: Option<f64>,
        delta_y: Option<f64>,
    },
    Text {
        text: String,
    },
    Key {
        key: String,
        code: String,
        modifiers: u32,
    },
    Evaluate {
        expression: String,
    },
    Pick {
        x: f64,
        y: f64,
    },
    Snapshot,
    Screenshot {
        full: bool,
        clip: Option<Value>,
        #[serde(default)]
        expected_revision: Option<String>,
    },
    Find {
        text: String,
        backwards: bool,
    },
    Cookies,
    ImportCookies {
        cookies: Value,
    },
    Storage,
}

#[cfg(test)]
#[path = "actions_tests.rs"]
mod tests;
