//! Gitlab integration; compiled independently of the other provider.
pub(crate) mod accounts;
pub(crate) mod tasks;
pub(crate) const CLI: &str = "glab";
pub(crate) fn login_name(user: &serde_json::Value) -> Option<&str> {
    user["username"].as_str()
}
