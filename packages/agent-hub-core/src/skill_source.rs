//! Contract for a catalog of versioned skills, shared by desktop adapters.

use std::{
    collections::HashMap,
    io::Read,
    sync::{Arc, Mutex},
};

use anyhow::{anyhow, ensure, Result};
use serde::{Deserialize, Serialize};

/// Catalog entry. The ID belongs to its source and is opaque to the host.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SkillSummary {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

/// A specific revision of a catalog entry. Versions are opaque source labels.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SkillVersion {
    pub version: String,
    /// Optional SHA-256 of the ZIP bytes, as 64 hexadecimal characters.
    pub sha256: Option<String>,
}

/// A bounded page from the catalog. Pass the opaque cursor to request more.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SkillSearchPage {
    pub skills: Vec<SkillSummary>,
    pub next_cursor: Option<String>,
}

/// A blocking catalog adapter. A desktop caller runs these calls off the UI thread.
///
/// An adapter owns its transport and credentials. IDs, versions and cursors
/// must be passed to the provider as data. They are not local paths.
pub trait SkillSource: Send + Sync {
    /// Search the provider and return one bounded page.
    fn search(&self, query: &str, cursor: Option<&str>) -> Result<SkillSearchPage>;

    /// List the available versions for a provider-specific skill ID.
    fn versions(&self, skill_id: &str) -> Result<Vec<SkillVersion>>;

    /// Stream the ZIP for exactly the requested version, even when newer versions exist.
    fn download(&self, skill_id: &str, version: &str) -> Result<Box<dyn Read + Send>>;
}

/// Sources registered by trusted desktop extensions at startup.
#[derive(Default)]
pub struct SkillSourceRegistry {
    sources: Mutex<HashMap<String, Arc<dyn SkillSource>>>,
}

/// Check the syntax of a durable catalog identifier.
pub fn valid_source_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

#[cfg(test)]
mod tests;

impl SkillSourceRegistry {
    /// Register one adapter under a stable, non-secret identifier.
    ///
    /// Duplicate identifiers are rejected so an extension cannot silently
    /// replace the source referenced by existing installations.
    pub fn register(&self, id: &str, source: impl SkillSource + 'static) -> Result<()> {
        ensure!(valid_source_id(id), "Invalid skill catalog ID");
        let mut sources = self
            .sources
            .lock()
            .map_err(|_| anyhow!("Skill catalog registry is unavailable"))?;
        ensure!(
            !sources.contains_key(id),
            "Skill catalog is already registered"
        );
        sources.insert(id.into(), Arc::new(source));
        Ok(())
    }

    /// Look up an adapter without holding the registry lock during its I/O.
    pub fn get(&self, id: &str) -> Result<Option<Arc<dyn SkillSource>>> {
        let sources = self
            .sources
            .lock()
            .map_err(|_| anyhow!("Skill catalog registry is unavailable"))?;
        Ok(sources.get(id).cloned())
    }
}
