use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Github,
    Gitlab,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CliLauncher {
    pub program: String,
    pub args: Vec<String>,
}
/// Existing desktop update notification contract, also used by manual checks.
#[derive(Debug, serde::Serialize)]
pub struct AppUpdateInfo {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_url: String,
}
