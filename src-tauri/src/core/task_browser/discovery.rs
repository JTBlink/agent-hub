//! Resolve task sources from project remotes and CLI-owned authentication.
//! No credentials are read, copied or persisted by this module.
use super::{Binding, Provider};
use crate::core::{cli_process, skill_store::SkillStore, tool_detection};
use anyhow::Result;
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

const EXCLUDED: &str = "task_browser_excluded_sources_v1";
type HostCache = HashMap<String, (Instant, HashSet<String>)>;
static HOSTS: OnceLock<Mutex<HostCache>> = OnceLock::new();

fn host_cache() -> &'static Mutex<HostCache> {
    HOSTS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub(super) fn refresh_hosts() {
    host_cache()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clear();
}

fn excluded(store: &SkillStore) -> Result<HashSet<String>> {
    Ok(store
        .get_setting(EXCLUDED)?
        .map(|text| serde_json::from_str(&text))
        .transpose()?
        .unwrap_or_default())
}

pub(super) fn exclude(store: &SkillStore, id: &str, binding: Option<&Binding>) -> Result<()> {
    let mut ids = excluded(store)?;
    ids.insert(id.into());
    if let Some(binding) = binding {
        ids.insert(source_id(
            &binding.project_id,
            &binding.host,
            &binding.repository,
        ));
    }
    store.set_setting(EXCLUDED, &serde_json::to_string(&ids)?)
}

fn status_hosts(text: &str) -> HashSet<String> {
    // Only retain hostnames, never account names or the rest of auth status.
    text.lines()
        .filter_map(|line| {
            let lower = line.to_ascii_lowercase();
            let host = lower
                .split_once("logged in to ")?
                .1
                .split_whitespace()
                .next()?;
            let host = host.trim_end_matches(':');
            (!host.is_empty()
                && host
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b".-:".contains(&c)))
            .then(|| host.to_owned())
        })
        .collect()
}

fn known_hosts(program: &str, default_host: &str) -> HashSet<String> {
    if let Some((time, hosts)) = host_cache()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(program)
    {
        if time.elapsed() < Duration::from_secs(30) {
            return hosts.clone();
        }
    }
    let mut hosts = HashSet::from([default_host.into()]);
    if let Some(path) = tool_detection::find_command(program) {
        // Keep the existing CLI environment (HOME, config overrides and keyring).
        // A failed host must not hide another host's configured authentication.
        let output = match cli_process::capture(
            &path.to_string_lossy(),
            &["auth", "status"],
            &[("GH_PROMPT_DISABLED", "1"), ("GLAB_CHECK_UPDATE", "false")],
            10,
            None,
            None,
        ) {
            Ok((stdout, stderr)) => format!("{stdout}\n{stderr}"),
            Err(error) => error,
        };
        hosts.extend(status_hosts(&output));
    }
    host_cache()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(program.into(), (Instant::now(), hosts.clone()));
    hosts
}

fn source(
    project_id: &str,
    remote: &str,
    github: &HashSet<String>,
    gitlab: &HashSet<String>,
) -> Option<Binding> {
    let (host, repository) = remote.split_once('/')?;
    let host = host.to_ascii_lowercase();
    let provider = match (github.contains(&host), gitlab.contains(&host)) {
        (true, false) => Provider::Github,
        (false, true) => Provider::Gitlab,
        _ => return None, // Unknown or conflicting hosts require explicit selection.
    };
    let binding = Binding {
        id: source_id(project_id, &host, repository),
        project_id: project_id.into(),
        provider,
        host,
        repository: repository.into(),
        launcher: None,
    };
    binding.validate().ok()?;
    Some(binding)
}

#[derive(serde::Serialize)]
pub struct RemoteCandidate {
    pub remote: String,
    pub provider: Option<Provider>,
}

pub fn remote_candidates(store: &SkillStore, project_id: &str) -> Result<Vec<RemoteCandidate>> {
    let github = known_hosts("gh", "github.com");
    let gitlab = known_hosts("glab", "gitlab.com");
    Ok(super::remotes(store, project_id)?
        .into_iter()
        .map(|remote| {
            let provider =
                source(project_id, &remote, &github, &gitlab).map(|binding| binding.provider);
            RemoteCandidate { remote, provider }
        })
        .collect())
}

fn source_id(project_id: &str, host: &str, repository: &str) -> String {
    let host = host.to_ascii_lowercase();
    let digest = Sha256::digest(format!("task-source\0{project_id}\0{host}\0{repository}"));
    let mut bytes = [0; 16];
    bytes.copy_from_slice(&digest[..16]);
    uuid::Uuid::from_bytes(bytes).to_string()
}

pub(super) fn bindings(store: &SkillStore, saved: Vec<Binding>) -> Result<Vec<Binding>> {
    discover(store, saved, || {
        (
            known_hosts("gh", "github.com"),
            known_hosts("glab", "gitlab.com"),
        )
    })
}

fn discover(
    store: &SkillStore,
    mut saved: Vec<Binding>,
    hosts: impl FnOnce() -> (HashSet<String>, HashSet<String>),
) -> Result<Vec<Binding>> {
    let projects = store.get_all_projects()?;
    let projects: Vec<_> = projects
        .into_iter()
        .filter(|project| !saved.iter().any(|binding| binding.project_id == project.id))
        .collect();
    if projects.is_empty() {
        return Ok(saved);
    }
    let (github, gitlab) = hosts();
    let excluded = excluded(store)?;
    for project in projects {
        let Ok(remotes) = super::remotes(store, &project.id) else {
            continue;
        };
        // Do not guess between a fork and upstream. The connection UI lets users
        // choose a remote when a project's repository is ambiguous.
        if remotes.len() != 1 {
            continue;
        }
        if let Some(binding) = source(&project.id, &remotes[0], &github, &gitlab) {
            if !excluded.contains(&binding.id) {
                saved.push(binding);
            }
        }
    }
    Ok(saved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_cli_authenticated_enterprise_hosts_without_copying_credentials() {
        let gh = status_hosts(
            "ghe.example.invalid\n  ✓ Logged in to ghe.example.invalid account demo (keyring)\n",
        );
        let gl = status_hosts(
            "git.example.invalid:8443\n  ✓ Logged in to git.example.invalid:8443 as demo\n",
        );
        let first = source("demo", "ghe.example.invalid/team/demo", &gh, &gl).unwrap();
        assert_eq!(first.provider, Provider::Github);
        assert!(first.launcher.is_none());
        assert_eq!(
            first.id,
            source("demo", "ghe.example.invalid/team/demo", &gh, &gl)
                .unwrap()
                .id
        );
        let second = source("demo", "git.example.invalid:8443/team/sub/demo", &gh, &gl).unwrap();
        assert_eq!(second.provider, Provider::Gitlab);
        assert_eq!(second.host, "git.example.invalid:8443");
        assert!(source("demo", "unknown.example.invalid/team/demo", &gh, &gl).is_none());
        assert!(source("demo", "ghe.example.invalid/team/demo", &gh, &gh).is_none());
    }

    #[test]
    fn registered_remote_loads_without_binding_and_respects_removal_and_override() {
        use crate::core::skill_store::ProjectRecord;
        let temp = tempfile::tempdir().unwrap();
        let store = SkillStore::new(&temp.path().join("store.db")).unwrap();
        let path = temp.path().join("project");
        let repo = git2::Repository::init(&path).unwrap();
        repo.remote("origin", "git@github.com:team/demo.git")
            .unwrap();
        store
            .insert_project(&ProjectRecord {
                id: "demo".into(),
                name: "Demo".into(),
                path: path.to_string_lossy().into(),
                workspace_type: "project".into(),
                linked_agent_key: None,
                linked_agent_name: None,
                disabled_path: None,
                sort_order: 0,
                created_at: 0,
                updated_at: 0,
                visited_at: None,
            })
            .unwrap();
        let hosts = || {
            (
                HashSet::from(["github.com".into()]),
                HashSet::from(["gitlab.com".into()]),
            )
        };
        let discovered = discover(&store, vec![], hosts).unwrap();
        assert_eq!(discovered.len(), 1);
        assert_eq!(discovered[0].repository, "team/demo");
        assert!(store
            .get_setting(super::super::SETTINGS_KEY)
            .unwrap()
            .is_none());
        let mut explicit = discovered[0].clone();
        explicit.launcher = Some(super::super::CliLauncher {
            program: "project-launcher".into(),
            args: vec![],
        });
        let saved = discover(&store, vec![explicit], || {
            panic!("explicit launcher must not be replaced by a global CLI")
        })
        .unwrap();
        assert_eq!(
            saved[0].launcher.as_ref().unwrap().program,
            "project-launcher"
        );
        exclude(&store, &discovered[0].id, None).unwrap();
        assert!(discover(&store, vec![], hosts).unwrap().is_empty());
        store.set_setting(EXCLUDED, "[]").unwrap();
        // Adding an upstream must require a deliberate remote choice.
        repo.remote("upstream", "git@github.com:upstream/demo.git")
            .unwrap();
        assert!(discover(&store, vec![], hosts).unwrap().is_empty());
    }
}
