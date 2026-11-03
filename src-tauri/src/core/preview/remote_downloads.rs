//! Context-scoped remote download configuration and event ownership.
use super::{super::error::AppError, runtime::Runtime};
use serde_json::{json, Value};
pub(super) fn managed_directory(base: &str, instance: &str) -> Result<String, AppError> {
    let normalized = base.replace('\\', "/");
    let absolute = normalized.starts_with('/') && !normalized.starts_with("//")
        || normalized.as_bytes().get(1) == Some(&b':')
            && normalized
                .as_bytes()
                .first()
                .is_some_and(u8::is_ascii_alphabetic)
            && normalized.as_bytes().get(2) == Some(&b'/');
    if !absolute
        || base.len() > 4096
        || base.chars().any(char::is_control)
        || normalized.split('/').any(|part| matches!(part, "." | ".."))
    {
        return Err(AppError::invalid_input(
            "Use an absolute remote download directory without dot segments or control characters",
        ));
    }
    Ok(format!(
        "{}/agent-hub-{instance}",
        normalized.trim_end_matches('/')
    ))
}
fn contains_frame(tree: &Value, expected: &str) -> Result<bool, AppError> {
    let mut pending = vec![tree];
    for _ in 0..2048 {
        let Some(tree) = pending.pop() else {
            return Ok(false);
        };
        if tree["frame"]["id"].as_str() == Some(expected) {
            return Ok(true);
        }
        if let Some(children) = tree["childFrames"].as_array() {
            pending.extend(children);
        }
    }
    if pending.is_empty() {
        Ok(false)
    } else {
        Err(AppError::network("Download frame inspection limit reached"))
    }
}
fn owned_targets<'a>(targets: &'a [Value], context: &str) -> Vec<&'a str> {
    targets
        .iter()
        .filter(|target| {
            target["browserContextId"].as_str() == Some(context)
                && matches!(target["type"].as_str(), Some("page" | "iframe"))
        })
        .filter_map(|target| target["targetId"].as_str())
        .collect()
}
impl Runtime {
    pub(super) fn remote_download_behavior(&self) -> Option<Value> {
        self.context.as_ref().zip(self.remote_download_dir.as_ref()).map(|(context, directory)| json!({"browserContextId":context,"behavior":"allowAndName","downloadPath":directory,"eventsEnabled":true}))
    }
    pub(super) fn configure_remote_downloads(&mut self) -> Result<(), AppError> {
        if let Some(params) = self.remote_download_behavior() {
            self.cdp.call("Browser.setDownloadBehavior", params)?;
        }
        Ok(())
    }
    pub(super) fn remember_download_frames(&mut self, tree: &Value) {
        let mut pending = vec![tree];
        for _ in 0..2048 {
            let Some(tree) = pending.pop() else {
                break;
            };
            if let Some(id) = tree["frame"]["id"]
                .as_str()
                .filter(|id| !id.is_empty() && id.len() <= 256)
            {
                if !self.download_frames.iter().any(|existing| existing == id) {
                    self.download_frames.push_back(id.into());
                    if self.download_frames.len() > 256 {
                        self.download_frames.pop_front();
                    }
                }
            }
            if let Some(children) = tree["childFrames"].as_array() {
                pending.extend(children);
            }
        }
    }
    pub(super) fn owns_download_frame(&mut self, frame: &str) -> Result<bool, AppError> {
        let Some(context) = &self.context else {
            return Ok(true);
        };
        if self.download_frames.iter().any(|known| known == frame) {
            return Ok(true);
        }
        let targets = self.cdp.call("Target.getTargets", json!({}))?;
        let targets = targets["targetInfos"]
            .as_array()
            .ok_or_else(|| AppError::network("Browser targets unavailable"))?;
        let owned = owned_targets(targets, context);
        if owned.contains(&frame) {
            return Ok(true);
        }
        let limited = owned.len() > 20;
        for target in owned.into_iter().take(20) {
            let attached = self.cdp.call(
                "Target.attachToTarget",
                json!({"targetId":target,"flatten":true}),
            )?;
            let session = attached["sessionId"]
                .as_str()
                .ok_or_else(|| AppError::network("Download frame inspection unavailable"))?;
            let result = self
                .cdp
                .call_in_session(session, "Page.getFrameTree", json!({}));
            let detached = self
                .cdp
                .call("Target.detachFromTarget", json!({"sessionId":session}));
            let result = result?;
            detached?;
            if contains_frame(&result["frameTree"], frame)? {
                self.remember_download_frames(&result["frameTree"]);
                return Ok(true);
            }
        }
        if limited {
            Err(AppError::network(
                "Download target inspection limit reached",
            ))
        } else {
            Ok(false)
        }
    }
}
#[cfg(test)]
#[path = "remote_downloads/tests.rs"]
mod tests;
