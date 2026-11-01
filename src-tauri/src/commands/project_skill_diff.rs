use super::{
    projects, skills::build_source_diff_entries, skills_diff_metadata::SkillSourceDiffDto,
};
use crate::core::{error::AppError, path_guard, skill_store::SkillStore};
use std::path::Path;
use std::sync::Arc;
use tauri::State;

/// Compare a workspace Agent's actual skill directory against its matched library copy.
#[tauri::command]
pub async fn get_project_skill_diff(
    project_id: String,
    skill_relative_path: String,
    agent: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<SkillSourceDiffDto, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        project_skill_diff(&store, &project_id, &skill_relative_path, &agent)
    })
    .await?
}

fn project_skill_diff(
    store: &SkillStore,
    project_id: &str,
    relative_path: &str,
    agent: &str,
) -> Result<SkillSourceDiffDto, AppError> {
    path_guard::ensure_safe_skill_relative_path(relative_path)?;
    let record = store
        .get_project_by_id(project_id)
        .map_err(AppError::db)?
        .ok_or_else(|| AppError::not_found("Workspace not found"))?;
    let configs = projects::agent_skill_configs(store);
    let skills = projects::read_workspace_skills(&record, &configs);
    let skill = skills
        .iter()
        .find(|skill| skill.relative_path == relative_path && skill.agent == agent)
        .ok_or_else(|| AppError::not_found("Skill not found in workspace"))?;
    let managed = store.get_all_skills().map_err(AppError::db)?;
    let center = projects::find_best_center_match(skill, &managed)
        .ok_or_else(|| AppError::not_found("No matching library skill"))?;
    let central_dir = Path::new(&center.central_path);
    let local_dir = Path::new(&skill.path);
    if !central_dir.is_dir() || !local_dir.is_dir() {
        return Err(AppError::not_found(
            "Compared skill directory no longer exists",
        ));
    }
    let entries = build_source_diff_entries(central_dir, local_dir);
    Ok(SkillSourceDiffDto::from_directories(
        center.id.clone(),
        skill.agent_display_name.clone(),
        "workspace".into(),
        central_dir,
        local_dir,
        skill.path.clone(),
        entries,
    ))
}

#[cfg(test)]
mod tests;
