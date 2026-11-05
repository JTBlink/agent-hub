//! Repository work, explicitly bound to registered local projects.
pub(crate) mod adapter;
mod cli;
pub(crate) mod development;
mod discovery;
mod identity;
#[cfg(feature = "herdr")]
mod launch;
pub(crate) mod metadata;
mod mutation;
mod query;
mod types;
use anyhow::{bail, Context, Result};
pub use cli::SystemCli;
pub use discovery::{remote_candidates, RemoteCandidate};
#[cfg(feature = "herdr")]
pub use launch::prepare_managed_workspace;
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
pub use types::*;

static BINDING_WRITES: std::sync::Mutex<()> = std::sync::Mutex::new(());
const SETTINGS_KEY: &str = "task_browser_bindings_v1";
pub const PAGE_SIZE: usize = 25;

impl Binding {
    pub fn validate(&self) -> Result<()> {
        self.provider.require()?;
        uuid::Uuid::parse_str(&self.id).context("Invalid repository binding identity")?;
        if self
            .host
            .contains(['/', '\\', '?', '#', '@', ' ', '\r', '\n', '\0'])
        {
            bail!("Enter a hostname without a URL path or credentials");
        }
        let url = reqwest::Url::parse(&format!("https://{}", self.host))?;
        if url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.path() != "/"
            || url.query().is_some()
            || url.fragment().is_some()
        {
            bail!("Enter a hostname without a URL path or credentials");
        }
        let parts: Vec<_> = self.repository.split('/').collect();
        if parts.len() < 2
            || (self.provider == Provider::Github && parts.len() != 2)
            || parts.iter().any(|part| {
                part.is_empty()
                    || *part == "."
                    || *part == ".."
                    || !part
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
            })
        {
            bail!("Enter the full repository namespace and name");
        }
        if let Some(launcher) = &self.launcher {
            if launcher.program.is_empty()
                || launcher.program.contains(['\0', '\r', '\n'])
                || launcher.args.len() > 32
                || launcher
                    .args
                    .iter()
                    .any(|arg| arg.len() > 4096 || arg.contains('\0'))
            {
                bail!("Invalid CLI launcher");
            }
        }
        Ok(())
    }
}
fn saved_bindings(store: &super::skill_store::SkillStore) -> Result<Vec<Binding>> {
    match store.get_setting(SETTINGS_KEY)? {
        Some(value) => Ok(serde_json::from_str(&value)?),
        None => Ok(Vec::new()),
    }
}
pub fn bindings(store: &super::skill_store::SkillStore) -> Result<Vec<Binding>> {
    discovery::bindings(store, saved_bindings(store)?)
}
/// Explicit sources never need unrelated repositories or host probes to resolve.
pub fn binding(store: &super::skill_store::SkillStore, id: &str) -> Result<Option<Binding>> {
    let saved = saved_bindings(store)?;
    if let Some(binding) = saved.iter().find(|binding| binding.id == id) {
        return Ok(Some(binding.clone()));
    }
    discovery::binding(store, saved, id)
}
/// Recheck CLI login after the user refreshes the task panel.
pub fn refresh_bindings(store: &super::skill_store::SkillStore) -> Result<Vec<Binding>> {
    discovery::refresh_hosts();
    identity::clear();
    bindings(store)
}
pub fn save_binding(store: &super::skill_store::SkillStore, binding: Binding) -> Result<()> {
    binding.validate()?;
    let _guard = BINDING_WRITES
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    super::project_paths::project_directory(store, &binding.project_id)?;
    let mut values = saved_bindings(store)?;
    values.retain(|value| value.id != binding.id);
    values.push(binding);
    store.set_setting(SETTINGS_KEY, &serde_json::to_string(&values)?)
}
pub fn remove_binding(store: &super::skill_store::SkillStore, id: &str) -> Result<()> {
    let _guard = BINDING_WRITES
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    // Removing a discovered source must also survive the next remote scan.
    let mut values = saved_bindings(store)?;
    discovery::exclude(store, id, values.iter().find(|binding| binding.id == id))?;
    values.retain(|value| value.id != id);
    store.set_setting(SETTINGS_KEY, &serde_json::to_string(&values)?)
}
pub fn remotes(store: &super::skill_store::SkillStore, project_id: &str) -> Result<Vec<String>> {
    let directory = super::project_paths::project_directory(store, project_id)?;
    let repo = git2::Repository::discover(directory)?;
    let mut result = Vec::new();
    for name in repo.remotes()?.iter().flatten() {
        if let Some(url) = repo.find_remote(name)?.url() {
            // Never return remote userinfo, access tokens or transport queries.
            if let Ok(parsed) = reqwest::Url::parse(url) {
                if let Some(host) = parsed.host_str() {
                    let host = match (parsed.scheme(), parsed.port()) {
                        ("https" | "http", Some(port)) => format!("{host}:{port}"),
                        _ => host.to_owned(),
                    };
                    result.push(format!(
                        "{host}/{}",
                        parsed
                            .path()
                            .trim_start_matches('/')
                            .trim_end_matches(".git")
                    ));
                }
            } else if let Some((_, path)) = url.split_once('@') {
                if let Some((host, repo)) = path.split_once(':') {
                    result.push(format!("{host}/{}", repo.trim_end_matches(".git")));
                }
            }
        }
    }
    result.sort();
    result.dedup();
    Ok(result)
}

/// The seam replaces only the external CLI, not task semantics.
pub trait CliReader {
    /// Identity reuse is opt-in because launchers may select different accounts.
    fn identity_scope(&self, _binding: &Binding) -> Option<String> {
        None
    }

    fn read(
        &self,
        binding: &Binding,
        args: &[String],
        cancel: &AtomicBool,
    ) -> std::result::Result<Value, TaskFailure>;
}
impl<F> CliReader for F
where
    F: Fn(&Binding, &[String], &AtomicBool) -> std::result::Result<Value, TaskFailure>,
{
    fn read(
        &self,
        binding: &Binding,
        args: &[String],
        cancel: &AtomicBool,
    ) -> std::result::Result<Value, TaskFailure> {
        self(binding, args, cancel)
    }
}
pub struct TaskClient<R> {
    reader: R,
}
impl<R: CliReader> TaskClient<R> {
    pub fn new(reader: R) -> Self {
        Self { reader }
    }
    pub(crate) fn api(
        &self,
        binding: &Binding,
        endpoint: String,
        cancel: &AtomicBool,
    ) -> std::result::Result<Value, TaskFailure> {
        self.request(binding, "GET", endpoint, &[], cancel)
    }
    pub(crate) fn request(
        &self,
        binding: &Binding,
        method: &str,
        endpoint: String,
        fields: &[(&str, String)],
        cancel: &AtomicBool,
    ) -> std::result::Result<Value, TaskFailure> {
        binding.provider.require()?;
        if cancel.load(Ordering::Acquire) {
            return Err(TaskFailure::new("cancelled", "Query cancelled"));
        }
        let mut args = vec![
            "api".into(),
            "--method".into(),
            method.into(),
            "--hostname".into(),
            binding.host.clone(),
            endpoint,
        ];
        // glab rejects --hostname with a port; SystemCli carries GITLAB_HOST.
        if binding.provider == Provider::Gitlab && binding.host.contains(':') {
            args.drain(3..5);
        }
        for (key, value) in fields {
            args.extend(["--raw-field".into(), format!("{key}={value}")]);
        }
        let result = self.reader.read(binding, &args, cancel);
        if result
            .as_ref()
            .is_err_and(|error| error.kind == "authentication")
        {
            if let Some(scope) = self.reader.identity_scope(binding) {
                identity::invalidate(&scope);
            }
        }
        result
    }
    pub fn list(
        &self,
        binding: &Binding,
        filters: &Filters,
        page: u32,
        cancel: &AtomicBool,
    ) -> std::result::Result<TaskPage, TaskFailure> {
        query::validate(binding, filters, page)?;
        let fetch = || {
            let user = self.api(binding, "user".into(), cancel)?;
            let username = adapter::string(
                &user,
                if binding.provider == Provider::Github {
                    "login"
                } else {
                    "username"
                },
            );
            if username.is_empty() {
                return Err(TaskFailure::new(
                    "authentication",
                    "Cannot determine the current platform identity",
                ));
            }
            Ok(username)
        };
        let username = match self.reader.identity_scope(binding) {
            Some(scope) => identity::get(&scope, cancel, fetch)?,
            None => fetch()?,
        };
        let endpoint = query::endpoint(binding, filters, page, &username);
        let response = self.api(binding, endpoint, cancel)?;
        adapter::page(binding, filters.kind, &username, page, response)
    }
    pub fn detail(
        &self,
        binding: &Binding,
        kind: TaskKind,
        number: u64,
        comments_page: u32,
        cancel: &AtomicBool,
    ) -> std::result::Result<TaskDetail, TaskFailure> {
        binding.validate()?;
        if number == 0 || comments_page == 0 || comments_page > 1000 {
            return Err(TaskFailure::new(
                "invalid_input",
                "Invalid task or discussion page",
            ));
        }
        let endpoint = adapter::object_endpoint(binding, kind, number);
        let item = self.api(binding, endpoint.clone(), cancel)?;
        let comments = self.api(
            binding,
            format!(
                "{}?per_page={PAGE_SIZE}&page={comments_page}",
                adapter::comments_endpoint(binding, kind, number)
            ),
            cancel,
        );
        let (comments, discussion_unavailable) = match comments {
            Ok(Value::Array(items)) => (items, false),
            Err(error) if error.kind == "cancelled" => return Err(error),
            _ => (Vec::new(), true),
        };
        let mut development = if comments_page == 1 {
            development::load(binding.provider, kind, &endpoint, &item, |endpoint| {
                self.api(binding, endpoint, cancel)
            })?
        } else {
            TaskDevelopment::default()
        };
        if discussion_unavailable {
            development.warnings.push("discussion".into());
        }
        Ok(TaskDetail {
            summary: adapter::summary(binding, kind, &item)?,
            body: adapter::string(
                &item,
                if binding.provider == Provider::Github {
                    "body"
                } else {
                    "description"
                },
            ),
            has_more_comments: comments.len() == PAGE_SIZE,
            comments: comments
                .iter()
                .map(|item| adapter::comment(binding.provider, item))
                .collect(),
            development,
        })
    }
}
