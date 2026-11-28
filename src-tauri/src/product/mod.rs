//! Read-only identity shared by the desktop host and its companion CLI.

include!(concat!(env!("OUT_DIR"), "/features.rs"));

/// Version embedded in the product bundle and companion CLI.
pub const VERSION: &str = env!("AGENT_HUB_PRODUCT_VERSION");

/// Command name presented by the companion CLI and used in the bundle.
pub const CLI_NAME: &str = env!("AGENT_HUB_PRODUCT_CLI_NAME");
const PRODUCT_ID: &str = env!("AGENT_HUB_PRODUCT_ID");
const DATA_ID: &str = env!("AGENT_HUB_DATA_ID");

#[derive(Debug, serde::Serialize)]
pub struct BuildInfo {
    pub product_id: &'static str,
    pub data_id: &'static str,
    pub config_hash: &'static str,
    pub base_commit: &'static str,
    pub features: Vec<&'static str>,
    pub version: &'static str,
}

/// Describe compiled features, independently of runtime environment variables.
pub fn current() -> BuildInfo {
    BuildInfo {
        product_id: PRODUCT_ID,
        data_id: DATA_ID,
        config_hash: env!("AGENT_HUB_PRODUCT_HASH"),
        base_commit: env!("AGENT_HUB_BASE_COMMIT"),
        features: COMPILED_FEATURES.to_vec(),
        version: VERSION,
    }
}

/// Stable identity for application-owned data and platform schedules.
pub fn application_id() -> String {
    if DATA_ID == "standard" {
        "com.jtstudio.agenthub".into()
    } else {
        format!("com.jtstudio.agenthub.{DATA_ID}")
    }
}

pub fn home_directory(home: &std::path::Path) -> std::path::PathBuf {
    home_for_id(home, DATA_ID)
}

pub(crate) fn product_home_directory(home: &std::path::Path) -> std::path::PathBuf {
    home_for_id(home, PRODUCT_ID)
}

fn home_for_id(home: &std::path::Path, id: &str) -> std::path::PathBuf {
    if id == "standard" {
        home.join(".agent-hub")
    } else {
        home.join(format!(".agent-hub-{id}"))
    }
}

pub(crate) fn credential_service() -> String {
    if DATA_ID == "standard" {
        "agent-hub-git-backup".into()
    } else {
        format!("agent-hub-git-backup-{DATA_ID}")
    }
}
