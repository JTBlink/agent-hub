//! Short-lived login names only; credentials remain owned by the platform CLI.
use super::TaskFailure;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock, TryLockError,
    },
    time::{Duration, Instant},
};

const TTL: Duration = Duration::from_secs(15 * 60);
const MAX_ENTRIES: usize = 128;
type Entry = Arc<Mutex<Option<(Instant, String)>>>;
type Cache = Mutex<HashMap<String, (Instant, Entry)>>;
static IDENTITIES: OnceLock<Cache> = OnceLock::new();

fn cache() -> &'static Cache {
    IDENTITIES.get_or_init(|| Mutex::new(HashMap::new()))
}

pub(super) fn clear() {
    cache().lock().unwrap_or_else(|e| e.into_inner()).clear();
}

pub(super) fn invalidate(scope: &str) {
    cache()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(scope);
}

pub(super) fn get(
    scope: &str,
    cancel: &AtomicBool,
    fetch: impl FnOnce() -> Result<String, TaskFailure>,
) -> Result<String, TaskFailure> {
    let entry = {
        let mut entries = cache().lock().unwrap_or_else(|e| e.into_inner());
        if !entries.contains_key(scope) && entries.len() >= MAX_ENTRIES {
            if let Some(oldest) = entries
                .iter()
                .min_by_key(|(_, (time, _))| time)
                .map(|(key, _)| key.clone())
            {
                entries.remove(&oldest);
            }
        }
        entries
            .entry(scope.into())
            .or_insert_with(|| (Instant::now(), Arc::default()))
            .1
            .clone()
    };
    // Serialize only the same identity, and let cancelled waiters leave promptly.
    let mut value = loop {
        if cancel.load(Ordering::Acquire) {
            return Err(TaskFailure::new("cancelled", "Query cancelled"));
        }
        match entry.try_lock() {
            Ok(value) => break value,
            Err(TryLockError::Poisoned(error)) => break error.into_inner(),
            Err(TryLockError::WouldBlock) => std::thread::sleep(Duration::from_millis(20)),
        }
    };
    if let Some((time, name)) = value.as_ref() {
        if time.elapsed() < TTL {
            return Ok(name.clone());
        }
    }
    let name = fetch()?;
    if cancel.load(Ordering::Acquire) {
        return Err(TaskFailure::new("cancelled", "Query cancelled"));
    }
    *value = Some((Instant::now(), name.clone()));
    Ok(name)
}

#[cfg(test)]
mod tests;
