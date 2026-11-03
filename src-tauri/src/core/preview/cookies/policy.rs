//! One bounded normalization policy for pasted, file and browser cookies.
use crate::core::error::AppError;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
pub const MAX_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_COOKIES: usize = 2000;
#[derive(Clone, Serialize, Deserialize)]
pub struct Cookie {
    pub name: String,
    pub value: String,
    pub domain: String,
    pub path: String,
    pub secure: bool,
    pub http_only: bool,
    pub host_only: bool,
    pub expires: Option<f64>,
    pub same_site: Option<String>,
    pub priority: Option<String>,
}
impl Cookie {
    pub fn key(&self) -> (String, String, String, bool) {
        (
            self.name.clone(),
            self.domain.clone(),
            self.path.clone(),
            self.host_only,
        )
    }
    pub fn params(&self) -> Value {
        let mut value = json!({"name":self.name,"value":self.value,"path":self.path,"secure":self.secure,"httpOnly":self.http_only});
        if self.host_only {
            value["url"] = json!(format!(
                "{}://{}{}",
                if self.secure { "https" } else { "http" },
                self.domain,
                self.path
            ));
        } else {
            value["domain"] = json!(format!(".{}", self.domain));
        }
        if let Some(expires) = self.expires {
            value["expires"] = json!(expires);
        }
        if let Some(site) = &self.same_site {
            value["sameSite"] = json!(site);
        }
        if let Some(priority) = &self.priority {
            value["priority"] = json!(priority);
        }
        value
    }
}
#[derive(Default, Clone, Serialize)]
pub struct Skipped {
    pub invalid: usize,
    pub expired: usize,
    pub partitioned: usize,
    pub bound: usize,
}
pub struct Normalized {
    pub cookies: Vec<Cookie>,
    pub skipped: Skipped,
    pub total: usize,
}
pub fn domain(value: &str) -> Option<String> {
    let host = value.trim().trim_start_matches('.');
    if host.chars().any(|c| c.is_control() || c.is_whitespace())
        || (host.contains(':') && !(host.starts_with('[') && host.ends_with(']')))
        || host.is_empty()
        || host.contains(['/', '\\', '@', '?', '#', '%'])
        || host.ends_with('.')
        || host.contains("..")
    {
        return None;
    }
    let url = reqwest::Url::parse(&format!("https://{host}/")).ok()?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.path() != "/"
    {
        return None;
    }
    let host = url.host_str()?.to_ascii_lowercase();
    if psl::suffix(host.as_bytes())
        .is_some_and(|suffix| suffix.is_known() && suffix.as_bytes() == host.as_bytes())
    {
        return None;
    }
    Some(host)
}
fn parse(value: &Value, now: f64) -> Result<Cookie, &'static str> {
    if value.get("partitionKey").is_some_and(|key| !key.is_null())
        || value.get("partitionKeyOpaque") == Some(&Value::Bool(true))
    {
        return Err("partitioned");
    }
    let raw = value["domain"].as_str().ok_or("invalid")?;
    let domain = domain(raw).ok_or("invalid")?;
    // Match the reference browser's conservative device-bound-session import policy.
    if domain == "google.com" || domain.ends_with(".google.com") || value["sourceBound"] == true {
        return Err("bound");
    }
    let name = value["name"]
        .as_str()
        .filter(|name| {
            !name.is_empty()
                && name.len() <= 4096
                && name
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&byte))
        })
        .ok_or("invalid")?;
    let content = value["value"]
        .as_str()
        .filter(|content| {
            content.len() <= 16 * 1024 && !content.chars().any(|c| c.is_control() || c == ';')
        })
        .ok_or("invalid")?;
    if name.len() + content.len() > 4096 {
        return Err("invalid");
    }
    let path = value["path"].as_str().unwrap_or("/");
    if !path.starts_with('/') || path.len() > 2048 || path.chars().any(char::is_control) {
        return Err("invalid");
    }
    let secure = boolean(value, "secure", false)?;
    let host_only = boolean(value, "hostOnly", !raw.starts_with('.'))?;
    let http_only = boolean(value, "httpOnly", false)?;
    let raw_expiry = match value.get("expires").or_else(|| value.get("expirationDate")) {
        None | Some(Value::Null) => None,
        Some(expiry) => Some(expiry.as_f64().ok_or("invalid")?),
    };
    if raw_expiry.is_some_and(|expiry| {
        (expiry < 0. && !(expiry == -1. && value["session"] == true))
            || (expiry > 0. && expiry <= now)
    }) {
        return Err("expired");
    }
    let expires = raw_expiry.filter(|expiry| *expiry > 0.);
    if value
        .get("sameSite")
        .is_some_and(|site| !site.is_null() && !site.is_string())
    {
        return Err("invalid");
    }
    let same_site = match value["sameSite"].as_str() {
        None | Some("unspecified") => None,
        Some("no_restriction" | "None") => Some("None".into()),
        Some("lax" | "Lax") => Some("Lax".into()),
        Some("strict" | "Strict") => Some("Strict".into()),
        _ => return Err("invalid"),
    };
    if same_site.as_deref() == Some("None") && !secure
        || name.starts_with("__Secure-") && !secure
        || name.starts_with("__Host-") && (!secure || !host_only || path != "/")
    {
        return Err("invalid");
    }
    let priority = value["priority"]
        .as_str()
        .filter(|priority| ["Low", "Medium", "High"].contains(priority))
        .map(str::to_owned);
    Ok(Cookie {
        name: name.into(),
        value: content.into(),
        domain,
        path: path.into(),
        secure,
        http_only,
        host_only,
        expires,
        same_site,
        priority,
    })
}
pub fn normalize(value: Value) -> Result<Normalized, AppError> {
    if value.to_string().len() > MAX_BYTES {
        return Err(AppError::invalid_input(
            "Cookie import exceeds 2 MiB; export fewer sites",
        ));
    }
    let entries = value
        .as_array()
        .or_else(|| value["cookies"].as_array())
        .ok_or_else(|| AppError::invalid_input("Expected a cookie JSON array or cookies object"))?;
    if entries.len() > MAX_COOKIES {
        return Err(AppError::invalid_input(
            "Cookie import exceeds 2000 cookies; export fewer sites",
        ));
    }
    let mut result = Normalized {
        cookies: Vec::new(),
        skipped: Skipped::default(),
        total: entries.len(),
    };
    let mut seen = HashSet::new();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64();
    for value in entries {
        match parse(value, now) {
            Ok(cookie) => {
                if seen.insert(cookie.key()) {
                    result.cookies.push(cookie);
                } else {
                    result.skipped.invalid += 1;
                }
            }
            Err("expired") => result.skipped.expired += 1,
            Err("partitioned") => result.skipped.partitioned += 1,
            Err("bound") => result.skipped.bound += 1,
            _ => result.skipped.invalid += 1,
        }
    }
    Ok(result)
}

fn boolean(value: &Value, key: &str, default: bool) -> Result<bool, &'static str> {
    match value.get(key) {
        None | Some(Value::Null) => Ok(default),
        Some(Value::Bool(value)) => Ok(*value),
        _ => Err("invalid"),
    }
}
