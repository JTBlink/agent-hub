/// Existing desktop update notification contract, also used by manual checks.
#[derive(Debug, serde::Serialize)]
pub struct AppUpdateInfo {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_url: String,
}
