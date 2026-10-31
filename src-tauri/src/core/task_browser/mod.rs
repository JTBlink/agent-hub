//! Read-only repository work, explicitly bound to registered local projects.
mod adapter;
mod types;
use anyhow::{bail, Context, Result};
use serde_json::Value;
use std::{
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
};
pub use types::*;

static BINDING_WRITES: std::sync::Mutex<()> = std::sync::Mutex::new(());
const SETTINGS_KEY: &str = "task_browser_bindings_v1";
pub const PAGE_SIZE: usize = 25;

impl Binding {
    pub fn validate(&self) -> Result<()> {
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
pub fn bindings(store: &super::skill_store::SkillStore) -> Result<Vec<Binding>> {
    match store.get_setting(SETTINGS_KEY)? {
        Some(value) => Ok(serde_json::from_str(&value)?),
        None => Ok(Vec::new()),
    }
}
pub fn save_binding(store: &super::skill_store::SkillStore, binding: Binding) -> Result<()> {
    binding.validate()?;
    let _guard = BINDING_WRITES
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    super::project_paths::project_directory(store, &binding.project_id)?;
    let mut values = bindings(store)?;
    values.retain(|value| value.id != binding.id);
    values.push(binding);
    store.set_setting(SETTINGS_KEY, &serde_json::to_string(&values)?)
}
pub fn remove_binding(store: &super::skill_store::SkillStore, id: &str) -> Result<()> {
    let _guard = BINDING_WRITES
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let mut values = bindings(store)?;
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
pub struct SystemCli {
    pub cwd: PathBuf,
}
impl CliReader for SystemCli {
    fn read(
        &self,
        binding: &Binding,
        args: &[String],
        cancel: &AtomicBool,
    ) -> std::result::Result<Value, TaskFailure> {
        if cancel.load(Ordering::Acquire) {
            return Err(TaskFailure::new("cancelled", "Query cancelled"));
        }
        let default = match binding.provider {
            Provider::Github => "gh",
            Provider::Gitlab => "glab",
        };
        let configured = binding.launcher.as_ref();
        let name = configured
            .map(|launcher| launcher.program.as_str())
            .unwrap_or(default);
        let path = if std::path::Path::new(name).is_absolute() {
            let path = PathBuf::from(name);
            super::tool_detection::executable(&path).then_some(path)
        } else {
            super::tool_detection::find_command(name)
        }
        .ok_or_else(|| {
            TaskFailure::new(
                "missing_cli",
                format!("CLI launcher is unavailable: {name}"),
            )
        })?;
        let mut command_args = configured
            .map(|launcher| launcher.args.clone())
            .unwrap_or_default();
        command_args.extend_from_slice(args);
        let arguments: Vec<_> = command_args.iter().map(String::as_str).collect();
        let text = super::cli_process::run(
            &path.to_string_lossy(),
            &arguments,
            &[
                ("GH_PROMPT_DISABLED", "1"),
                ("GITLAB_HOST", &binding.host),
                ("GLAB_CHECK_UPDATE", "false"),
            ],
            20,
            Some(&self.cwd),
            Some(cancel),
        )
        .map_err(TaskFailure::cli)?;
        serde_json::from_str(&text)
            .map_err(|_| TaskFailure::new("invalid_response", "Platform CLI returned invalid JSON"))
    }
}
pub struct TaskClient<R> {
    reader: R,
}
impl<R: CliReader> TaskClient<R> {
    pub fn new(reader: R) -> Self {
        Self { reader }
    }
    fn api(
        &self,
        binding: &Binding,
        endpoint: String,
        cancel: &AtomicBool,
    ) -> std::result::Result<Value, TaskFailure> {
        if cancel.load(Ordering::Acquire) {
            return Err(TaskFailure::new("cancelled", "Query cancelled"));
        }
        self.reader.read(
            binding,
            &[
                "api".into(),
                "--method".into(),
                "GET".into(),
                "--hostname".into(),
                binding.host.clone(),
                endpoint,
            ],
            cancel,
        )
    }
    pub fn list(
        &self,
        binding: &Binding,
        filters: &Filters,
        page: u32,
        cancel: &AtomicBool,
    ) -> std::result::Result<TaskPage, TaskFailure> {
        adapter::validate_query(binding, filters, page)?;
        let identity = self.api(binding, "user".into(), cancel)?;
        let username = adapter::string(
            &identity,
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
        let endpoint = adapter::list_endpoint(binding, filters, page, &username);
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
        let item = self.api(binding, endpoint, cancel)?;
        let comments = self.api(
            binding,
            format!(
                "{}?per_page={PAGE_SIZE}&page={comments_page}",
                adapter::comments_endpoint(binding, kind, number)
            ),
            cancel,
        )?;
        let comments = comments
            .as_array()
            .ok_or_else(|| TaskFailure::new("invalid_response", "Invalid discussion response"))?;
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
        })
    }
}
