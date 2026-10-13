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
mod tests {
    use super::*;
    use crate::core::skill_store::{ProjectRecord, SkillRecord};

    fn fixture(
        disabled: bool,
    ) -> (
        tempfile::TempDir,
        SkillStore,
        std::path::PathBuf,
        std::path::PathBuf,
    ) {
        let temp = tempfile::tempdir().unwrap();
        let store = SkillStore::new(&temp.path().join("store.db")).unwrap();
        let project = temp.path().join("project");
        let local = if disabled {
            project.join(".claude").join("skills-disabled").join("demo")
        } else {
            project.join(".claude").join("skills").join("demo")
        };
        let central = temp.path().join("library/demo");
        for root in [&local, &central] {
            std::fs::create_dir_all(root.join("references")).unwrap();
            std::fs::write(
                root.join("SKILL.md"),
                "---\nname: demo\nmetadata:\n  version: 1.0.0\n---\nSame document\n",
            )
            .unwrap();
        }
        std::fs::write(local.join("references/helper.md"), "project changes").unwrap();
        std::fs::write(central.join("references/helper.md"), "center changes").unwrap();
        store
            .insert_project(&ProjectRecord {
                id: "project".into(),
                name: "Demo project".into(),
                path: project.to_string_lossy().into_owned(),
                workspace_type: "project".into(),
                linked_agent_key: None,
                linked_agent_name: None,
                disabled_path: None,
                sort_order: 0,
                created_at: 1,
                updated_at: 1,
                visited_at: None,
            })
            .unwrap();
        store
            .insert_skill(&SkillRecord {
                id: "center".into(),
                name: "demo".into(),
                description: None,
                source_type: "local".into(),
                source_ref: Some(local.to_string_lossy().into_owned()),
                source_ref_resolved: None,
                source_subpath: None,
                source_branch: None,
                source_revision: None,
                source_agent: None,
                remote_revision: None,
                central_path: central.to_string_lossy().into_owned(),
                content_hash: None,
                enabled: true,
                created_at: 1,
                updated_at: 1,
                status: "active".into(),
                update_status: "unknown".into(),
                last_checked_at: None,
                last_check_error: None,
            })
            .unwrap();
        (temp, store, local, central)
    }

    #[test]
    fn compares_project_supporting_files_when_main_documents_match() {
        let (_temp, store, local, central) = fixture(false);
        let result = project_skill_diff(&store, "project", "demo", "claude_code").unwrap();
        assert_eq!(result.skill_id, "center");
        assert_eq!(result.central_path, central.to_string_lossy());
        assert_eq!(result.source_path, local.to_string_lossy());
        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.entries[0].relative_path, "references/helper.md");
        assert_eq!(
            result.entries[0].original_text.as_deref(),
            Some("center changes")
        );
        assert_eq!(
            result.entries[0].updated_text.as_deref(),
            Some("project changes")
        );
        assert_eq!(result.version_comparison, "same_version");
    }

    #[test]
    fn compares_disabled_project_copy_and_rejects_unregistered_paths() {
        let (_temp, store, local, _) = fixture(true);
        let result = project_skill_diff(&store, "project", "demo", "claude_code").unwrap();
        assert_eq!(result.source_path, local.to_string_lossy());
        assert!(project_skill_diff(&store, "project", "../demo", "claude_code").is_err());
        assert!(project_skill_diff(&store, "project", "demo", "unknown_agent").is_err());
    }

    #[test]
    fn returns_no_changes_for_a_project_alias_to_the_center() {
        let (_temp, store, local, central) = fixture(false);
        std::fs::remove_dir_all(&local).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&central, &local).unwrap();
        #[cfg(windows)]
        {
            // Same-content copies cover the equality contract without requiring link privileges.
            std::fs::create_dir_all(local.join("references")).unwrap();
            std::fs::copy(central.join("SKILL.md"), local.join("SKILL.md")).unwrap();
            std::fs::copy(
                central.join("references/helper.md"),
                local.join("references/helper.md"),
            )
            .unwrap();
        }
        let result = project_skill_diff(&store, "project", "demo", "claude_code").unwrap();
        assert!(result.entries.is_empty());
    }
}
