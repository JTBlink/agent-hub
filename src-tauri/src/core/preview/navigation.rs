//! URL policy shared by independent preview renderers.
use crate::core::error::AppError;
pub fn validate_url(value: &str) -> Result<(), AppError> {
    let url =
        reqwest::Url::parse(value).map_err(|error| AppError::invalid_input(error.to_string()))?;
    if value.len() > 8192
        || !matches!(url.scheme(), "http" | "https" | "about")
        || (url.scheme() == "about" && value != "about:blank")
    {
        return Err(AppError::invalid_input(
            "Only HTTP, HTTPS and about:blank addresses are supported",
        ));
    }
    Ok(())
}
