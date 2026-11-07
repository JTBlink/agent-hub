//! CLI-owned platform accounts. Account management never stores or returns credentials.
use super::cli::{validate_host, PlatformCli};
use crate::core::{
    skill_store::SkillStore,
    task_browser::{self, Binding, Provider, TaskFailure},
    terminal::{TerminalSize, TerminalSpec},
};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::atomic::AtomicBool};

pub(crate) struct AccountAdapter {
    pub status_args: fn(&str) -> Vec<String>,
    pub login_args: fn(&str) -> Vec<String>,
    pub token_args: fn(&str) -> Vec<String>,
    pub switch_args: Option<fn(&str, &str) -> Vec<String>>,
    pub parse: fn(&str, serde_json::Value) -> Result<Vec<LoginAccount>, TaskFailure>,
}
#[derive(Clone, Debug, Serialize)]
pub struct AccountContext {
    pub id: String,
    pub provider: Provider,
    pub host: String,
    pub label: String,
    pub project_scoped: bool,
    pub remembered: bool,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct AccountTarget {
    pub context_id: String,
    pub provider: Provider,
    pub host: String,
}
#[derive(Debug, Serialize, PartialEq)]
pub struct LoginAccount {
    pub host: String,
    pub username: String,
    pub active: bool,
    pub authenticated: bool,
    pub switchable: bool,
}
/// Default CLI contexts remain available even when no project has been registered.
pub fn contexts(store: &SkillStore) -> Result<Vec<AccountContext>> {
    contexts_with_hosts(store, || {
        let mut result = Vec::new();
        for (provider, program, default_host) in [
            (Provider::Github, "gh", "github.com"),
            (Provider::Gitlab, "glab", "gitlab.com"),
        ] {
            let mut hosts: Vec<_> = super::hosts::known_hosts(program, default_host)
                .into_iter()
                .collect();
            hosts.sort();
            result.extend(hosts.into_iter().map(|host| (provider, host)));
        }
        result
    })
}
fn contexts_with_hosts(
    store: &SkillStore,
    cli_hosts: impl FnOnce() -> Vec<(Provider, String)>,
) -> Result<Vec<AccountContext>> {
    let mut result = Vec::new();
    for (provider, host) in [
        (Provider::Github, "github.com"),
        (Provider::Gitlab, "gitlab.com"),
    ] {
        if provider.enabled() {
            result.push(AccountContext {
                id: format!("default-{}", provider_name(provider)),
                provider,
                host: host.into(),
                label: String::new(),
                project_scoped: false,
                remembered: false,
            });
        }
    }
    let mut seen = std::collections::HashSet::new();
    let projects = store.get_all_projects()?;
    for binding in task_browser::bindings(store)? {
        let key = serde_json::to_string(&(
            binding.provider,
            binding.host.to_ascii_lowercase(),
            &binding.launcher,
            binding.launcher.as_ref().map(|_| &binding.project_id),
        ))?;
        if !seen.insert(key)
            || (binding.launcher.is_none()
                && result.iter().any(|context| {
                    context.provider == binding.provider
                        && context.host.eq_ignore_ascii_case(&binding.host)
                }))
        {
            continue;
        }
        result.push(AccountContext {
            id: if binding.launcher.is_some() {
                binding.id
            } else {
                format!("default-{}", provider_name(binding.provider))
            },
            provider: binding.provider,
            host: binding.host,
            label: if binding.launcher.is_some() {
                projects
                    .iter()
                    .find(|project| project.id == binding.project_id)
                    .map(|project| project.name.clone())
                    .unwrap_or_default()
            } else {
                String::new()
            },
            project_scoped: binding.launcher.is_some(),
            remembered: false,
        });
    }
    for (provider, host) in cli_hosts() {
        if !result.iter().any(|context| {
            context.provider == provider
                && context.host.eq_ignore_ascii_case(&host)
                && !context.project_scoped
        }) {
            result.push(AccountContext {
                id: format!("default-{}", provider_name(provider)),
                provider,
                host,
                label: String::new(),
                project_scoped: false,
                remembered: false,
            });
        }
    }
    for target in remembered(store)? {
        if !target.provider.enabled() {
            continue;
        }
        if let Some(context) = result.iter_mut().find(|context| {
            context.provider == target.provider
                && context.host.eq_ignore_ascii_case(&target.host)
                && !context.project_scoped
        }) {
            context.remembered = true;
        } else {
            result.push(AccountContext {
                id: target.context_id,
                provider: target.provider,
                host: target.host,
                label: String::new(),
                project_scoped: false,
                remembered: true,
            });
        }
    }
    Ok(result)
}
fn provider_name(provider: Provider) -> &'static str {
    match provider {
        Provider::Github => "github",
        Provider::Gitlab => "gitlab",
    }
}
pub struct AccountSession {
    pub target: AccountTarget,
    binding: Option<Binding>,
    cwd: PathBuf,
}
impl AccountSession {
    pub fn resolve(store: &SkillStore, target: AccountTarget) -> Result<Self, TaskFailure> {
        target.provider.require()?;
        validate_host(&target.host)?;
        let binding = if target.context_id == format!("default-{}", provider_name(target.provider))
        {
            None
        } else {
            let binding = task_browser::binding(store, &target.context_id)?.ok_or_else(|| {
                TaskFailure::new("not_connected", "Account context is no longer available")
            })?;
            binding.validate()?;
            if binding.provider != target.provider
                || !binding.host.eq_ignore_ascii_case(&target.host)
            {
                return Err(TaskFailure::new(
                    "invalid_input",
                    "Account context does not match the selected host",
                ));
            }
            Some(binding)
        };
        let cwd = match &binding {
            Some(binding) => {
                crate::core::project_paths::project_directory(store, &binding.project_id)?
            }
            None => dirs::home_dir()
                .ok_or_else(|| TaskFailure::new("invalid_input", "Home directory unavailable"))?,
        };
        Ok(Self {
            target,
            binding,
            cwd,
        })
    }
    fn cli(&self) -> PlatformCli<'_> {
        PlatformCli {
            provider: self.target.provider,
            host: &self.target.host,
            launcher: self
                .binding
                .as_ref()
                .and_then(|binding| binding.launcher.as_ref()),
            cwd: &self.cwd,
        }
    }
    pub fn list(&self, cancel: &AtomicBool) -> Result<Vec<LoginAccount>, TaskFailure> {
        let args = (self.target.provider.account_adapter()?.status_args)(&self.target.host);
        let raw = self.cli().run(&args, cancel)?;
        let value = serde_json::from_str(&raw).map_err(|_| {
            TaskFailure::new(
                "invalid_response",
                "Platform CLI returned invalid account data",
            )
        })?;
        (self.target.provider.account_adapter()?.parse)(&self.target.host, value)
    }
    pub fn switch(&self, username: &str) -> Result<Vec<LoginAccount>, TaskFailure> {
        let cancel = AtomicBool::new(false);
        let accounts = self.list(&cancel)?;
        if !accounts
            .iter()
            .any(|account| account.username == username && account.switchable)
        {
            return Err(TaskFailure::new(
                "invalid_input",
                "Select an authenticated CLI account",
            ));
        }
        let args = self
            .target
            .provider
            .account_adapter()?
            .switch_args
            .ok_or_else(|| {
                TaskFailure::new(
                    "reauthentication_required",
                    "This CLI requires signing in to switch accounts",
                )
            })?(&self.target.host, username);
        self.cli().run(&args, &cancel)?;
        let accounts = self.list(&cancel)?;
        if !accounts
            .iter()
            .any(|account| account.username == username && account.active && account.authenticated)
        {
            return Err(TaskFailure::new(
                "authentication",
                "CLI account switch was not confirmed",
            ));
        }
        Ok(accounts)
    }
    pub fn token_login(&self, token: &str) -> Result<Vec<LoginAccount>, TaskFailure> {
        use std::io::{Seek, SeekFrom, Write};
        if token.trim().is_empty() || token.len() > 16384 || token.contains(['\0', '\r', '\n']) {
            return Err(TaskFailure::new(
                "invalid_input",
                "Enter a single authentication token",
            ));
        }
        let adapter = self.target.provider.account_adapter()?;
        let mut args = (adapter.token_args)(&self.target.host);
        if self.target.provider == Provider::Gitlab {
            // Older glab requires an opt-in flag; newer releases use the keyring by default.
            let help = self.cli().run(
                &["auth".into(), "login".into(), "--help".into()],
                &AtomicBool::new(false),
            )?;
            if help.contains("--use-keyring") {
                args.push("--use-keyring".into());
            }
        }
        let (program, args) = self.cli().command(&args)?;
        let mut input = tempfile::tempfile()
            .map_err(|_| TaskFailure::new("internal", "Cannot prepare CLI input"))?;
        input
            .write_all(token.trim().as_bytes())
            .and_then(|_| input.write_all(b"\n"))
            .map_err(|_| TaskFailure::new("internal", "Cannot prepare CLI input"))?;
        input
            .seek(SeekFrom::Start(0))
            .map_err(|_| TaskFailure::new("internal", "Cannot prepare CLI input"))?;
        let mut command = std::process::Command::new(&program);
        command
            .args(args)
            .current_dir(&self.cwd)
            .env("GH_PROMPT_DISABLED", "1")
            .env("GITLAB_HOST", &self.target.host)
            .env("GLAB_CHECK_UPDATE", "false");
        // Never forward CLI login diagnostics: they may echo credentials.
        crate::core::cli_process::capture_prepared_with_input(
            command,
            "Platform login",
            90,
            None,
            Some(input),
        )
        .map_err(|_| TaskFailure::new("authentication", "CLI token login failed"))?;
        let accounts = self
            .list(&AtomicBool::new(false))
            .map_err(|_| TaskFailure::new("authentication", "Cannot verify the CLI login"))?;
        if !accounts
            .iter()
            .any(|account| account.active && account.authenticated)
        {
            return Err(TaskFailure::new(
                "authentication",
                "Cannot verify the CLI login",
            ));
        }
        Ok(accounts)
    }
    pub fn login(&self, size: TerminalSize) -> Result<TerminalSpec, TaskFailure> {
        size.validate()?;
        let args = (self.target.provider.account_adapter()?.login_args)(&self.target.host);
        let (program, args) = self.cli().command(&args)?;
        let mut command = portable_pty::CommandBuilder::new(program);
        command.args(args);
        command.cwd(&self.cwd);
        command.env_remove("GH_PROMPT_DISABLED");
        command.env("GITLAB_HOST", &self.target.host);
        command.env("GLAB_CHECK_UPDATE", "false");
        command.env("TERM", "xterm-256color");
        Ok(TerminalSpec {
            project_id: format!("platform-account:{}", provider_name(self.target.provider)),
            cwd: self.cwd.clone(),
            command,
            integration: None,
            size,
        })
    }
}

const HOSTS_KEY: &str = "platform_account_hosts_v1";
static HOST_WRITES: std::sync::Mutex<()> = std::sync::Mutex::new(());
fn remembered(store: &SkillStore) -> Result<Vec<AccountTarget>> {
    match store.get_setting(HOSTS_KEY)? {
        Some(value) => Ok(serde_json::from_str(&value)?),
        None => Ok(Vec::new()),
    }
}
pub(crate) fn remembered_hosts(store: &SkillStore) -> Result<Vec<(Provider, String)>> {
    Ok(remembered(store)?
        .into_iter()
        .filter(|target| target.provider.enabled())
        .map(|target| (target.provider, target.host.to_ascii_lowercase()))
        .collect())
}
/// Only host metadata is stored; credentials remain owned by the selected CLI.
pub fn remember(store: &SkillStore, target: &AccountTarget) -> Result<()> {
    if target.context_id != format!("default-{}", provider_name(target.provider)) {
        return Ok(());
    }
    validate_host(&target.host)?;
    let _guard = HOST_WRITES
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let mut targets = remembered(store)?;
    targets.retain(|saved| {
        saved.provider != target.provider || !saved.host.eq_ignore_ascii_case(&target.host)
    });
    targets.push(target.clone());
    if targets.len() > 64 {
        targets.remove(0);
    }
    store.set_setting(HOSTS_KEY, &serde_json::to_string(&targets)?)
}
pub fn forget(store: &SkillStore, target: &AccountTarget) -> Result<()> {
    let _guard = HOST_WRITES
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let mut targets = remembered(store)?;
    targets.retain(|saved| {
        saved.provider != target.provider || !saved.host.eq_ignore_ascii_case(&target.host)
    });
    store.set_setting(HOSTS_KEY, &serde_json::to_string(&targets)?)
}

#[cfg(all(test, unix, any(feature = "github", feature = "gitlab")))]
mod tests;
