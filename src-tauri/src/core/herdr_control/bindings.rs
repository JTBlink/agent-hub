use super::*;
use crate::core::skill_store::{ProjectRecord, SkillStore};

/// Register existing directories without initializing or changing skill folders.
pub(super) fn resolve_project(store: &SkillStore, directory: &Path) -> Result<String> {
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
    for project in projects {
        if Path::new(&project.path).canonicalize().ok().as_deref() == Some(directory)
            || crate::core::project_worktrees::directory(
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
    store.insert_project(&project)?;
    Ok(project.id)
}
