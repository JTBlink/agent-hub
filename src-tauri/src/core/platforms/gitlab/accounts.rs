use super::super::accounts::{AccountAdapter, LoginAccount};
use crate::core::task_browser::TaskFailure;
use serde_json::Value;
/// glab has one active identity per host. Switching requires its interactive login flow.
pub const ADAPTER: AccountAdapter = AccountAdapter {
    status_args: |host| {
        let mut args = vec!["api".into(), "--method".into(), "GET".into()];
        if !host.contains(':') {
            args.extend(["--hostname".into(), host.into()]);
        }
        args.push("user".into());
        args
    },
    login_args: |host| {
        vec![
            "auth".into(),
            "login".into(),
            "--hostname".into(),
            host.into(),
        ]
    },
    token_args: |host| {
        vec![
            "auth".into(),
            "login".into(),
            "--hostname".into(),
            host.into(),
            "--stdin".into(),
        ]
    },
    switch_args: None,
    parse: parse_accounts,
};
fn parse_accounts(host: &str, value: Value) -> Result<Vec<LoginAccount>, TaskFailure> {
    let username = super::login_name(&value)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| {
            TaskFailure::new(
                "authentication",
                "Cannot determine the current GitLab identity",
            )
        })?;
    Ok(vec![LoginAccount {
        host: host.into(),
        username: username.into(),
        active: true,
        authenticated: true,
        switchable: false,
    }])
}
