//! Resolve task sources from project remotes and CLI-owned authentication.
//! No credentials are read, copied or persisted by this module.
use super::{Binding, Provider};
use crate::core::{platforms::hosts::known_hosts, skill_store::SkillStore};
use anyhow::Result;
use sha2::{Digest, Sha256};
use std::collections::HashSet;

pub(super) use crate::core::platforms::hosts::refresh_hosts;
#[cfg(all(test, feature = "github", feature = "gitlab"))]
use crate::core::platforms::hosts::status_hosts;

const EXCLUDED: &str = "task_browser_excluded_sources_v1";
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
    let (mut github, mut gitlab) = hosts_for(&remotes);
    include_remembered_hosts(store, &mut github, &mut gitlab)?;
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
        if Provider::Github.enabled() {
            HashSet::from(["github.com".into()])
        } else {
            HashSet::new()
        },
        if Provider::Gitlab.enabled() {
            HashSet::from(["gitlab.com".into()])
        } else {
            HashSet::new()
        },
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

fn include_remembered_hosts(
    store: &SkillStore,
    github: &mut HashSet<String>,
    gitlab: &mut HashSet<String>,
) -> Result<()> {
    for (provider, host) in crate::core::platforms::accounts::remembered_hosts(store)? {
        match provider {
            Provider::Github => {
                github.insert(host);
            }
            Provider::Gitlab => {
                gitlab.insert(host);
            }
        }
    }
    Ok(())
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
    saved.retain(|binding| binding.provider.enabled());
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
    let (mut github, mut gitlab) = if candidates
        .iter()
        .any(|(_, remote)| !is_public_remote(remote))
    {
        hosts()
    } else {
        default_hosts()
    };
    include_remembered_hosts(store, &mut github, &mut gitlab)?;
    for (project_id, remote) in candidates {
        if let Some(binding) = source(&project_id, &remote, &github, &gitlab) {
            saved.push(binding);
        }
    }
    Ok(saved)
}

#[cfg(all(test, feature = "github", feature = "gitlab"))]
mod tests;
