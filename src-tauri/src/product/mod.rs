//! Read-only identity shared by the desktop host and its companion CLI.

#[derive(Debug, serde::Serialize)]
pub struct BuildInfo {
    pub product_id: &'static str,
    pub config_hash: &'static str,
    pub base_commit: &'static str,
    pub features: Vec<&'static str>,
    pub version: &'static str,
}

/// Describe compiled capabilities, independently of runtime environment variables.
pub fn current() -> BuildInfo {
    let mut features = Vec::new();
    if cfg!(feature = "herdr") {
        features.push("herdr");
    }
    if cfg!(feature = "standard") {
        features.push("standard");
    }
    BuildInfo {
        product_id: env!("AGENT_HUB_PRODUCT_ID"),
        config_hash: env!("AGENT_HUB_PRODUCT_HASH"),
        base_commit: env!("AGENT_HUB_BASE_COMMIT"),
        features,
        version: env!("CARGO_PKG_VERSION"),
    }
}

/// Stable identity for application-owned data and platform schedules.
/// A feature-set update keeps this identity; separate products use separate IDs.
pub fn application_id() -> String {
    let product = current();
    if product.product_id == "standard" {
        "com.jtstudio.agenthub".into()
    } else {
        format!("com.jtstudio.agenthub.{}", product.product_id)
    }
}

/// Preserve the standard home while isolating independently built products.
pub fn home_directory(home: &std::path::Path) -> std::path::PathBuf {
    let product = current();
    if product.product_id == "standard" {
        home.join(".agent-hub")
    } else {
        home.join(".agent-hub-products").join(product.product_id)
    }
}

pub(crate) fn credential_service() -> String {
    let product = current();
    if product.product_id == "standard" {
        "agent-hub-git-backup".into()
    } else {
        format!("agent-hub-git-backup-{}", product.product_id)
    }
}
