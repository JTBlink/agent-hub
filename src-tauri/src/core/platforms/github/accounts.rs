use super::super::accounts::{AccountAdapter, LoginAccount};
use crate::core::task_browser::TaskFailure;
use serde_json::Value;
pub const ADAPTER: AccountAdapter = AccountAdapter {
    status_args: |host| {
        vec![
            "auth".into(),
            "status".into(),
            "--hostname".into(),
            host.into(),
            "--json".into(),
            "hosts".into(),
        ]
    },
    login_args: |host| {
        vec![
            "auth".into(),
            "login".into(),
            "--hostname".into(),
            host.into(),
            "--web".into(),
        ]
    },
    token_args: |host| {
        vec![
            "auth".into(),
            "login".into(),
            "--hostname".into(),
            host.into(),
            "--with-token".into(),
        ]
    },
    switch_args: Some(|host, username| {
        vec![
            "auth".into(),
            "switch".into(),
            "--hostname".into(),
            host.into(),
            "--user".into(),
            username.into(),
        ]
    }),
    parse: parse_accounts,
};
fn parse_accounts(host: &str, value: Value) -> Result<Vec<LoginAccount>, TaskFailure> {
    let hosts = value["hosts"]
        .as_object()
        .ok_or_else(|| TaskFailure::new("invalid_response", "Missing account inventory"))?;
    let mut accounts = Vec::new();
    for (name, entries) in hosts {
        if !name.eq_ignore_ascii_case(host) {
            continue;
        }
        for entry in entries
            .as_array()
            .ok_or_else(|| TaskFailure::new("invalid_response", "Invalid account inventory"))?
        {
            let Some(username) = entry["login"].as_str().filter(|name| !name.is_empty()) else {
                continue;
            };
            let authenticated = entry["state"].as_str() == Some("success");
            let source = entry["tokenSource"].as_str().unwrap_or_default();
            accounts.push(LoginAccount {
                host: name.clone(),
                username: username.into(),
                active: entry["active"].as_bool().unwrap_or(false),
                authenticated,
                switchable: authenticated
                    && !matches!(
                        source,
                        "GH_TOKEN"
                            | "GITHUB_TOKEN"
                            | "GH_ENTERPRISE_TOKEN"
                            | "GITHUB_ENTERPRISE_TOKEN"
                    ),
            });
        }
    }
    Ok(accounts)
}
