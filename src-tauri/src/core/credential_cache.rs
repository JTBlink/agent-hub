//! Per-process keychain reads; secrets remain in memory and the OS keychain.
use super::git_credentials::RemoteCredential;
use anyhow::Result;

use std::{collections::HashMap, sync::Mutex};

type ReadResult = std::result::Result<Option<RemoteCredential>, String>;

#[derive(Default)]
pub(super) struct CredentialCache {
    reads: Mutex<HashMap<String, ReadResult>>,
}

impl CredentialCache {
    pub(super) fn read(
        &self,
        host: &str,
        read: impl FnOnce() -> Result<Option<RemoteCredential>>,
    ) -> Result<Option<RemoteCredential>> {
        // Hold across the OS read so concurrent authentication cannot open
        // duplicate prompts before the first authorization has finished.
        let mut reads = self.reads.lock().unwrap_or_else(|e| e.into_inner());
        reads
            .entry(host.to_ascii_lowercase())
            .or_insert_with(|| read().map_err(|error| format!("{error:#}")))
            .clone()
            .map_err(anyhow::Error::msg)
    }

    pub(super) fn write(
        &self,
        host: &str,
        credential: Option<RemoteCredential>,
        write: impl FnOnce() -> Result<()>,
    ) -> Result<()> {
        let mut reads = self.reads.lock().unwrap_or_else(|e| e.into_inner());
        write()?;
        reads.insert(host.to_ascii_lowercase(), Ok(credential));
        Ok(())
    }
}

#[cfg(test)]
mod tests;
