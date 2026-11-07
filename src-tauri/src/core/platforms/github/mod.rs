//! Github integration; compiled independently of the other provider.
pub(crate) mod accounts;
pub(crate) mod tasks;
pub(crate) const CLI: &str = "gh";
pub(crate) fn login_name(user: &serde_json::Value) -> Option<&str> {
    user["login"].as_str()
}
pub mod backup_api;
pub(crate) mod credentials;
pub mod updates;
