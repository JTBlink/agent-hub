//! Resolve task sources from project remotes and CLI-owned authentication.
//! No credentials are read, copied or persisted by this module.
use super::{Binding, Provider};
use crate::core::{cli_process, skill_store::SkillStore, tool_detection};
use anyhow::Result;
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex, OnceLock,
    },
    time::{Duration, Instant},
};

const EXCLUDED: &str = "task_browser_excluded_sources_v1";
type HostCache = HashMap<String, (Instant, HashSet<String>)>;
static HOSTS: OnceLock<Mutex<HostCache>> = OnceLock::new();
static HOST_GENERATION: AtomicU64 = AtomicU64::new(0);
static HOST_PROBES: [Mutex<()>; 2] = [Mutex::new(()), Mutex::new(())];

fn host_cache() -> &'static Mutex<HostCache> {
    HOSTS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub(super) fn refresh_hosts() {
    let mut cache = host_cache().lock().unwrap_or_else(|e| e.into_inner());
    HOST_GENERATION.fetch_add(1, Ordering::AcqRel);
    cache.clear();
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
    let _probe = HOST_PROBES[usize::from(program == "glab")]
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if let Some((time, hosts)) = host_cache()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(program)
    {
        if time.elapsed() < Duration::from_secs(15 * 60) {
            return hosts.clone();
        }
    }
    let generation = HOST_GENERATION.load(Ordering::Acquire);
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
    let mut cache = host_cache().lock().unwrap_or_else(|e| e.into_inner());
    if HOST_GENERATION.load(Ordering::Acquire) == generation {
        cache.insert(program.into(), (Instant::now(), hosts.clone()));
    }
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
    let remotes = super::remotes(store, project_id)?;
    let (github, gitlab) = hosts_for(&remotes);
    Ok(remotes
        .into_iter()
        .map(|remote| {
            let provider =
                source(project_id, &remote, &github, &gitlab).map(|binding| binding.provider);
            RemoteCandidate { remote, provider }
        })
        .collect())
}

fn default_hosts() -> (HashSet<String>, HashSet<String>) {
    (
        HashSet::from(["github.com".into()]),
        HashSet::from(["gitlab.com".into()]),
    )
}

fn authenticated_hosts() -> (HashSet<String>, HashSet<String>) {
    std::thread::scope(|scope| {
        let github = scope.spawn(|| known_hosts("gh", "github.com"));
        let gitlab = known_hosts("glab", "gitlab.com");
        (github.join().unwrap_or_else(|_| default_hosts().0), gitlab)
    })
}

fn hosts_for(remotes: &[String]) -> (HashSet<String>, HashSet<String>) {
    if remotes.iter().any(|remote| !is_public_remote(remote)) {
        authenticated_hosts()
    } else {
        default_hosts()
    }
}

fn is_public_remote(remote: &str) -> bool {
    remote.split_once('/').is_some_and(|(host, _)| {
        host.eq_ignore_ascii_case("github.com") || host.eq_ignore_ascii_case("gitlab.com")
    })
}

fn source_id(project_id: &str, host: &str, repository: &str) -> String {
    let host = host.to_ascii_lowercase();
    let digest = Sha256::digest(format!("task-source\0{project_id}\0{host}\0{repository}"));
    let mut bytes = [0; 16];
    bytes.copy_from_slice(&digest[..16]);
    uuid::Uuid::from_bytes(bytes).to_string()
}

pub(super) fn bindings(store: &SkillStore, saved: Vec<Binding>) -> Result<Vec<Binding>> {
    discover(store, saved, authenticated_hosts)
}

pub(super) fn binding(
    store: &SkillStore,
    saved: Vec<Binding>,
    id: &str,
) -> Result<Option<Binding>> {
    Ok(
        discover_matching(store, saved, authenticated_hosts, Some(id))?
            .into_iter()
            .find(|binding| binding.id == id),
    )
}

fn discover(
    store: &SkillStore,
    saved: Vec<Binding>,
    hosts: impl FnOnce() -> (HashSet<String>, HashSet<String>),
) -> Result<Vec<Binding>> {
    discover_matching(store, saved, hosts, None)
}

fn discover_matching(
    store: &SkillStore,
    mut saved: Vec<Binding>,
    hosts: impl FnOnce() -> (HashSet<String>, HashSet<String>),
    wanted: Option<&str>,
) -> Result<Vec<Binding>> {
    let projects = store.get_all_projects()?;
    let projects: Vec<_> = projects
        .into_iter()
        .filter(|project| !saved.iter().any(|binding| binding.project_id == project.id))
        .collect();
    if projects.is_empty() {
        return Ok(saved);
    }
    let excluded = excluded(store)?;
    let candidates: Vec<_> = projects
        .into_iter()
        .filter_map(|project| {
            let remotes = super::remotes(store, &project.id).ok()?;
            if remotes.len() != 1 {
                return None;
            }
            let remote = remotes.into_iter().next()?;
            let (host, repository) = remote.split_once('/')?;
            let id = source_id(&project.id, host, repository);
            if excluded.contains(&id) || wanted.is_some_and(|wanted| wanted != id) {
                return None;
            }
            Some((project.id, remote))
        })
        .collect();
    // Public hosts and folders need no online login probe before the first list.
    let (github, gitlab) = if candidates
        .iter()
        .any(|(_, remote)| !is_public_remote(remote))
    {
        hosts()
    } else {
        default_hosts()
    };
    for (project_id, remote) in candidates {
        if let Some(binding) = source(&project_id, &remote, &github, &gitlab) {
            saved.push(binding);
        }
    }
    Ok(saved)
}

#[cfg(test)]
mod tests;
