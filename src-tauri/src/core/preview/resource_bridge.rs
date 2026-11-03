//! Share capability-checked document bytes with the local server and owned CDP pages.
use super::{assets, documents::Documents};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::io::Read;
pub(super) const LIMIT: u64 = 16 * 1024 * 1024;
pub(super) struct Resource {
    pub code: u16,
    pub mime: &'static str,
    pub content: Vec<u8>,
}
impl Resource {
    fn error(code: u16) -> Self {
        Self {
            code,
            mime: "text/plain",
            content: b"Resource unavailable".to_vec(),
        }
    }
}
pub(super) fn load(documents: &Documents, id: &str, relative: &str, method: &str) -> Resource {
    if !matches!(method, "GET" | "HEAD") {
        return Resource::error(405);
    }
    let Ok(relative) = urlencoding::decode(relative) else {
        return Resource::error(400);
    };
    let Ok(path) = documents.resource(id, &relative) else {
        return Resource::error(404);
    };
    let Ok(file) = std::fs::File::open(&path) else {
        return Resource::error(404);
    };
    let mut content = Vec::new();
    if file.take(LIMIT + 1).read_to_end(&mut content).is_err() || content.len() as u64 > LIMIT {
        return Resource::error(404);
    }
    Resource {
        code: 200,
        mime: assets::mime(&path),
        content,
    }
}
pub(super) fn fulfillment(documents: &Documents, params: &Value) -> Value {
    let response = (|| {
        let url = reqwest::Url::parse(params["request"]["url"].as_str()?).ok()?;
        if url.scheme() != "http" || !url.username().is_empty() || url.password().is_some() {
            return None;
        }
        let id = url.host_str()?.strip_suffix(".agent-hub.localhost")?;
        uuid::Uuid::parse_str(id).ok()?;
        Some(load(
            documents,
            id,
            url.path().trim_start_matches('/'),
            params["request"]["method"].as_str().unwrap_or_default(),
        ))
    })()
    .unwrap_or_else(|| Resource::error(404));
    let length = response.content.len();
    let head = params["request"]["method"] == "HEAD";
    json!({"requestId":params["requestId"],"responseCode":response.code,
        "responseHeaders":[{"name":"Content-Type","value":response.mime},{"name":"Content-Length","value":length.to_string()},
        {"name":"Cache-Control","value":"no-store"},{"name":"X-Content-Type-Options","value":"nosniff"},{"name":"Access-Control-Allow-Origin","value":"*"}],
        "body":STANDARD.encode(if head { &[] } else { response.content.as_slice() })})
}
#[cfg(test)]
mod tests;
