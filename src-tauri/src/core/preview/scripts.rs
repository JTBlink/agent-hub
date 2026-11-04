//! One bounded DOM inspection contract shared by native WebView and Chromium.
pub(crate) fn picker() -> String {
    include_str!("scripts/pick.js")
        .replace("__ELEMENT_CONTEXT__", include_str!("scripts/elements.js"))
}
pub(crate) fn snapshot(token: &str) -> String {
    include_str!("scripts/snapshot.js")
        .replace("__ELEMENT_CONTEXT__", include_str!("scripts/elements.js"))
        .replace("__SNAPSHOT_ID__", token)
}

#[derive(Clone, Copy)]
pub(crate) enum ReferenceAction<'a> {
    Inspect,
    Click,
    Fill(&'a str),
}
pub(crate) fn reference(
    reference: &str,
    action: ReferenceAction<'_>,
) -> Result<String, super::super::error::AppError> {
    use super::super::error::AppError;
    let valid = reference.split_once(':').is_some_and(|(token, index)| {
        token.len() == 32
            && token.bytes().all(|value| value.is_ascii_hexdigit())
            && index.parse::<usize>().is_ok_and(|index| index < 500)
    });
    if reference.len() > 100 || !valid {
        return Err(AppError::invalid_input("Invalid snapshot reference"));
    }
    let value = if let ReferenceAction::Fill(value) = action {
        Some(value)
    } else {
        None
    };
    if value.is_some_and(|value| value.len() > 64 * 1024) {
        return Err(AppError::invalid_input("Input exceeds limit"));
    }
    Ok(include_str!("scripts/reference.js")
        .replace("__ELEMENT_CONTEXT__", include_str!("scripts/elements.js"))
        .replace(
            "__OPERATION__",
            match action {
                ReferenceAction::Inspect => "\"inspect\"",
                ReferenceAction::Click => "\"click\"",
                ReferenceAction::Fill(_) => "\"fill\"",
            },
        )
        .replacen(
            "__REFERENCE__",
            &serde_json::to_string(reference).map_err(AppError::io)?,
            1,
        )
        .replacen(
            "__VALUE__",
            &serde_json::to_string(&value).map_err(AppError::io)?,
            1,
        ))
}

pub(crate) fn find(text: &str, backwards: bool) -> Result<String, super::super::error::AppError> {
    use super::super::error::AppError;
    if text.len() > 64 * 1024 {
        return Err(AppError::invalid_input("Find text exceeds limit"));
    }
    Ok(include_str!("scripts/find.js")
        .replace("__BACKWARDS__", if backwards { "true" } else { "false" })
        .replace(
            "__TEXT__",
            &serde_json::to_string(text).map_err(AppError::io)?,
        ))
}

pub(crate) const STORAGE: &str = include_str!("scripts/storage.js");
