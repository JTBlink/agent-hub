//! Metadata-only registration shared by workspace windows and native integrations.

use crate::core::skill_store::{ProjectRecord, SkillStore};
use anyhow::{bail, Result};
use std::path::Path;

/// Register existing directories without initializing or changing skill folders.
pub fn resolve_project(store: &SkillStore, directory: &Path) -> Result<String> {
    let directory = directory.canonicalize()?;
    if !directory.is_dir() {
        bail!("Workspace must be a directory");
    }
    let directory = directory.as_path();
    let projects: Vec<_> = store
        .get_all_projects()?
        .into_iter()
        .filter(|p| p.workspace_type == "project")
        .collect();
    if let Some(project) = projects
        .iter()
        .find(|p| Path::new(&p.path).canonicalize().ok().as_deref() == Some(directory))
    {
        return Ok(project.id.clone());
    }
    // Only linked worktrees need repository-wide lookup. Ordinary roots must
    // not invoke Git to enumerate every registered repository's checkouts.
    let is_worktree = |path: &Path| {
        git2::Repository::open_ext(path, git2::RepositoryOpenFlags::NO_SEARCH, &[] as &[&Path])
            .is_ok_and(|repository| repository.is_worktree())
    };
    let candidate_is_worktree = is_worktree(directory);
    for project in projects {
        if (candidate_is_worktree || is_worktree(Path::new(&project.path)))
            && crate::core::project_worktrees::directory(
                store,
                &project.id,
                Some(&directory.to_string_lossy()),
            )
            .ok()
            .as_deref()
                == Some(directory)
        {
            return Ok(project.id);
        }
    }
    let now = chrono::Utc::now().timestamp_millis();
    let project = ProjectRecord {
        id: uuid::Uuid::new_v4().to_string(),
        name: directory
            .file_name()
            .and_then(|p| p.to_str())
            .unwrap_or("workspace")
            .into(),
        path: directory.to_string_lossy().into(),
        workspace_type: "project".into(),
        linked_agent_key: None,
        linked_agent_name: None,
        disabled_path: None,
        sort_order: 0,
        created_at: now,
        updated_at: now,
        visited_at: Some(now),
    };
    if let Err(error) = store.insert_project(&project) {
        // Another window or integration may have registered this same root meanwhile.
        if let Some(existing) = store
            .get_all_projects()?
            .into_iter()
            .find(|item| item.path == project.path && item.workspace_type == "project")
        {
            return Ok(existing.id);
        }
        return Err(error);
    }
    Ok(project.id)
}

#[cfg(test)]
#[path = "workspace_registration/tests.rs"]
mod tests;
