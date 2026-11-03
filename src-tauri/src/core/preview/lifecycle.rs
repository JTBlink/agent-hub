//! Retain recovery identities while releasing confirmed exited, application-owned processes.
use super::{
    browser::{Browsers, PageStatus, State},
    runtime::OwnedChild,
};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
impl State {
    pub(super) fn mark_pages_lost(&mut self, ids: impl IntoIterator<Item = String>) {
        for id in ids {
            if let Some(page) = self.pages.get(&id) {
                self.lost_pages.insert(id);
                if let Ok(mut metadata) = page.metadata.lock() {
                    metadata.status = PageStatus::Gone;
                }
            }
        }
    }
    pub(super) fn interrupt_downloads(&mut self, keys: impl IntoIterator<Item = String>) {
        for key in keys {
            if let Some(item) = self.downloads.get_mut(&key) {
                if item.state == "inProgress" {
                    item.state = "interrupted".into();
                    item.verified = false;
                }
            }
        }
    }
}
impl Browsers {
    pub(super) fn reap_exited(&self) {
        let processes = match self.state.try_lock() {
            Ok(state) => state.processes.clone(),
            Err(_) => return,
        };
        self.reap_observed(&processes);
    }
    fn reap_observed(&self, processes: &HashMap<String, Arc<Mutex<OwnedChild>>>) {
        // No CDP requests: an unresponsive remote endpoint must never count as an exited owned process.
        let exited: Vec<_> = processes
            .iter()
            .filter(|(_, child)| {
                child.try_lock().ok().is_some_and(|mut child| {
                    child
                        .process
                        .try_wait()
                        .is_ok_and(|status| status.is_some())
                })
            })
            .collect();
        if exited.is_empty() {
            return;
        }
        let Ok(downloads) = self.downloads_gate.try_lock() else {
            return;
        };
        let Ok(mut state) = self.state.try_lock() else {
            return;
        };
        if state.closing {
            return;
        }
        let mut retired = Vec::new();
        for (profile, observed) in exited {
            if !state
                .processes
                .get(profile)
                .is_some_and(|current| Arc::ptr_eq(current, observed))
                || state.reopening_profiles.contains_key(profile)
                || state.pending.values().any(|id| id == profile)
                || state.attaching.iter().any(|(id, _)| id == profile)
            {
                continue;
            }
            let ids = state
                .pages
                .iter()
                .filter(|(_, page)| &page.profile == profile)
                .map(|(id, _)| id.clone())
                .collect::<Vec<_>>();
            state.mark_pages_lost(ids);
            let keys = state
                .downloads
                .iter()
                .filter(|(_, item)| &item.profile == profile)
                .map(|(key, _)| key.clone())
                .collect::<Vec<_>>();
            state.interrupt_downloads(keys);
            retired.push((
                state.runtimes.remove(profile),
                state.processes.remove(profile),
            ));
            state.idle.remove(profile);
            state.starting.remove(profile);
        }
        drop(state);
        drop(downloads);
        // Closing runtime sockets and dropping temporary directories happen outside shared state locks.
        drop(retired);
    }
}
#[cfg(test)]
#[path = "lifecycle/tests.rs"]
mod tests;
