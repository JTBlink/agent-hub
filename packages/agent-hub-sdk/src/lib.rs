//! Versioned reference to the AgentHub desktop SDK distribution.

/// Cargo package version, matched to the SDK distribution it installs.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Lock file containing the SDK download URL, version, commit and SHA-256.
pub const RELEASE_LOCK_JSON: &str = include_str!("../registry-release.json");
