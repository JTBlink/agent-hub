use serde::Deserialize;
use tauri::{AppHandle, Manager, Url};

const EMBEDDED_BROWSER_PREFIX: &str = "embedded-browser-";

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BrowserAction {
    Back,
    Forward,
    Reload,
}

fn validate_label(label: &str) -> Result<(), String> {
    let suffix = label
        .strip_prefix(EMBEDDED_BROWSER_PREFIX)
        .ok_or_else(|| "browser label is outside the embedded browser container".to_owned())?;
    if suffix.is_empty()
        || !suffix
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err("browser label is invalid".into());
    }
    Ok(())
}

fn parse_web_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "browser URL is invalid".to_owned())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("browser URL must use http or https".into());
    }
    Ok(url)
}

fn embedded_webview(app: &AppHandle, label: &str) -> Result<tauri::Webview, String> {
    validate_label(label)?;
    app.get_webview(label)
        .ok_or_else(|| "embedded browser is not available".to_owned())
}

#[tauri::command]
pub fn navigate_embedded_browser(app: AppHandle, label: String, url: String) -> Result<(), String> {
    embedded_webview(&app, &label)?
        .navigate(parse_web_url(&url)?)
        .map_err(|_| "could not navigate the embedded browser".to_owned())
}

#[tauri::command]
pub fn control_embedded_browser(
    app: AppHandle,
    label: String,
    action: BrowserAction,
) -> Result<(), String> {
    let webview = embedded_webview(&app, &label)?;
    match action {
        BrowserAction::Back => webview.eval("window.history.back()"),
        BrowserAction::Forward => webview.eval("window.history.forward()"),
        BrowserAction::Reload => webview.reload(),
    }
    .map_err(|_| "could not control the embedded browser".to_owned())
}

#[tauri::command]
pub fn embedded_browser_url(app: AppHandle, label: String) -> Result<String, String> {
    embedded_webview(&app, &label)?
        .url()
        .map(|url| url.to_string())
        .map_err(|_| "could not read the embedded browser URL".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_embedded_browser_labels() {
        assert!(validate_label("embedded-browser-123-1").is_ok());
        assert!(validate_label("main").is_err());
        assert!(validate_label("embedded-browser-../main").is_err());
    }

    #[test]
    fn accepts_only_web_urls() {
        assert!(parse_web_url("https://skills.sh/").is_ok());
        assert!(parse_web_url("http://localhost:1420/").is_ok());
        assert!(parse_web_url("file:///tmp/skills").is_err());
        assert!(parse_web_url("javascript:alert(1)").is_err());
    }
}
