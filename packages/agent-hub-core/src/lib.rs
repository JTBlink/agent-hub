//! Shared AgentHub domain library.

pub mod agent_launch;

/// Cargo package version, matched to the SDK distribution it installs.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// The repository, version and immutable commit for the SDK sources.
pub const RELEASE_LOCK_JSON: &str = include_str!(concat!(env!("OUT_DIR"), "/sdk-source.json"));
