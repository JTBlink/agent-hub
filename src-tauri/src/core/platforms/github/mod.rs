//! Github integration; compiled independently of the other provider.
pub(crate) mod tasks;
pub(crate) const CLI: &str = "gh";
pub mod backup_api;
pub(crate) mod credentials;
pub mod updates;
