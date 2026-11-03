use super::{
    policy::{self, Cookie},
    Target,
};
use crate::core::{
    error::AppError,
    preview::{browser::Browsers, cdp::Cdp},
};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
};
#[derive(Serialize)]
pub struct ImportResult {
    pub imported: usize,
    pub removed: usize,
}
impl Browsers {
    pub(super) fn apply_cookies(
        &self,
        target: &Target,
        cookies: Vec<Cookie>,
        replace: bool,
    ) -> Result<ImportResult, AppError> {
        let gate = {
            let mut state = self
                .state
                .lock()
                .map_err(|_| AppError::internal("Browser state unavailable"))?;
            state
                .cookie_gates
                .entry(target.profile.clone())
                .or_insert_with(|| Arc::new(Mutex::new(())))
                .clone()
        };
        let _mutation = gate
            .lock()
            .map_err(|_| AppError::internal("Cookie mutation unavailable"))?;
        let page = self.page(&target.id)?;
        let mut page = page
            .lock()
            .map_err(|_| AppError::internal("Browser page unavailable"))?;
        let (revision, url) = page.identity()?;
        if revision != target.revision || url != target.url {
            return Err(AppError::cancelled(
                "Page changed; inspect the cookie source again",
            ));
        }
        let selected = cookies
            .iter()
            .map(|cookie| cookie.domain.clone())
            .collect::<HashSet<_>>();
        let current = page.cdp.call("Network.getAllCookies", json!({}))?;
        let current = current["cookies"]
            .as_array()
            .ok_or_else(|| AppError::network("Current browser cookies unavailable"))?
            .iter()
            .filter(|cookie| {
                cookie["domain"]
                    .as_str()
                    .and_then(policy::domain)
                    .is_some_and(|domain| selected.contains(&domain))
            })
            .cloned()
            .collect::<Vec<_>>();
        if replace
            && current.iter().any(|cookie| {
                cookie.get("partitionKey").is_some_and(|key| !key.is_null())
                    || cookie["partitionKeyOpaque"] == true
            })
        {
            return Err(AppError::invalid_input("The selected sites contain partitioned cookies; use merge to preserve their sessions"));
        }
        let original = policy::normalize(json!(current))?;
        if original.skipped.invalid > 0 {
            return Err(AppError::invalid_input(
                "Existing cookies cannot be safely restored; use another profile",
            ));
        }
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs_f64();
        if cookies
            .iter()
            .any(|cookie| cookie.expires.is_some_and(|expires| expires <= now))
        {
            return Err(AppError::cancelled(
                "Some cookies expired after the preview; inspect the source again",
            ));
        }
        let mut removed = Vec::new();
        let mut written = Vec::new();
        let result: Result<ImportResult, AppError> = (|| {
            if replace {
                for cookie in &original.cookies {
                    removed.push(cookie.clone());
                    delete(&mut page.cdp, cookie)?;
                }
            }
            for cookie in &cookies {
                written.push(cookie.clone());
                set(&mut page.cdp, cookie)?;
            }
            Ok(ImportResult {
                imported: written.len(),
                removed: removed.len(),
            })
        })();
        match result {
            Ok(result) => Ok(result),
            Err(_) => {
                let restored = (|| {
                    for previous in &original.cookies {
                        if removed
                            .iter()
                            .chain(written.iter())
                            .any(|cookie| cookie.key() == previous.key())
                        {
                            set(&mut page.cdp, previous)?;
                        }
                    }
                    for cookie in &written {
                        if !original
                            .cookies
                            .iter()
                            .any(|previous| previous.key() == cookie.key())
                        {
                            delete(&mut page.cdp, cookie)?;
                        }
                    }
                    Ok::<(), AppError>(())
                })()
                .is_ok();
                Err(AppError::network(if restored {
                    "Cookie import failed; previous cookies were restored. Inspect the source before retrying"
                } else {
                    "Cookie import failed and restoration could not be verified. Inspect the current session before retrying"
                }))
            }
        }
    }
    pub(in crate::core::preview) fn import_cookie_values(
        &self,
        id: &str,
        values: Value,
    ) -> Result<Value, AppError> {
        let normalized = policy::normalize(values)?;
        if normalized.skipped.invalid
            + normalized.skipped.expired
            + normalized.skipped.partitioned
            + normalized.skipped.bound
            > 0
        {
            return Err(AppError::invalid_input(
                "Some cookies cannot be imported; use the settings preview to inspect them",
            ));
        }
        let page = self.page(id)?;
        let revision = page
            .lock()
            .map_err(|_| AppError::internal("Browser page unavailable"))?
            .identity()?
            .0;
        let target = super::target(self, id, &revision)?;
        serde_json::to_value(self.apply_cookies(&target, normalized.cookies, false)?)
            .map_err(AppError::io)
    }
}
fn set(cdp: &mut Cdp, cookie: &Cookie) -> Result<(), AppError> {
    if cdp.call("Network.setCookie", cookie.params())?["success"] != true {
        return Err(AppError::invalid_input("Browser rejected a cookie"));
    }
    Ok(())
}
fn delete(cdp: &mut Cdp, cookie: &Cookie) -> Result<(), AppError> {
    cdp.call("Network.deleteCookies",json!({"name":cookie.name,"domain":if cookie.host_only{cookie.domain.clone()}else{format!(".{}",cookie.domain)},"path":cookie.path}))?;
    Ok(())
}
