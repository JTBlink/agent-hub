use std::path::{Path, PathBuf};
use std::sync::Arc;

use semver::Version;
use serde::Serialize;
use tauri::State;

use crate::core::{
    central_repo, error::AppError, scenario_service, skill_metadata, skill_store::SkillStore,
    sync_engine, tool_adapters, tool_service,
};

const SKILL_NAME: &str = "agent-hub-cli";
const BUNDLED_SKILL: &str = include_str!("../../../skills/productivity/agent-hub-cli/SKILL.md");

#[derive(Debug, Serialize)]
pub struct SkillLocation {
    pub path: String,
    pub present: bool,
    pub occupied: bool,
    pub version: Option<String>,
    pub outdated: bool,
}

#[derive(Debug, Serialize)]
pub struct AgentSkillLocation {
    pub key: String,
    pub display_name: String,
    pub installed: bool,
    pub enabled: bool,
    pub managed: bool,
    #[serde(flatten)]
    pub location: SkillLocation,
}

#[derive(Debug, Serialize)]
pub struct AgentControlStatus {
    pub bundled_version: String,
    pub library_skill_id: Option<String>,
    pub library_source_type: Option<String>,
    pub library_update_available: bool,
    pub library: SkillLocation,
    pub agents: Vec<AgentSkillLocation>,
}

fn inspect_location(path: &Path, bundled_version: &Version) -> SkillLocation {
    let occupied = path.symlink_metadata().is_ok();
    let metadata = skill_metadata::parse_skill_md(path);
    let present =
        skill_metadata::is_valid_skill_dir(path) && metadata.name.as_deref() == Some(SKILL_NAME);
    let version = present.then_some(metadata.version).flatten();
    let outdated = present
        && match version
            .as_deref()
            .and_then(|value| Version::parse(value).ok())
        {
            Some(installed) => installed < *bundled_version,
            None => true,
        };

    SkillLocation {
        path: path.to_string_lossy().into_owned(),
        present,
        occupied,
        version,
        outdated,
    }
}

fn inspect(store: &SkillStore) -> Result<AgentControlStatus, AppError> {
    let bundled_version = skill_metadata::parse_frontmatter(BUNDLED_SKILL)
        .version
        .and_then(|value| Version::parse(&value).ok())
        .ok_or_else(|| AppError::internal("Bundled agent-hub-cli has no valid version"))?;
    let skills = store.get_all_skills().map_err(AppError::db)?;
    let skill = skills.iter().find(|skill| skill.name == SKILL_NAME);
    let library_path = skill
        .map(|skill| PathBuf::from(&skill.central_path))
        .unwrap_or_else(|| central_repo::skills_dir().join(SKILL_NAME));
    let targets = store.get_all_targets().map_err(AppError::db)?;
    let target_name = skill
        .map(|skill| sync_engine::target_dir_name(&library_path, &skill.name))
        .unwrap_or_else(|| SKILL_NAME.to_string());
    let disabled = tool_service::get_disabled_tools(store);

    let agents = tool_adapters::all_tool_adapters(store)
        .into_iter()
        .map(|adapter| {
            let target = skill.and_then(|skill| {
                targets
                    .iter()
                    .find(|target| target.skill_id == skill.id && target.tool == adapter.key)
            });
            let path = scenario_service::deployment_target(
                &adapter,
                &target_name,
                skill.map(|skill| skill.id.as_str()).unwrap_or(""),
                &targets,
            );
            AgentSkillLocation {
                key: adapter.key.clone(),
                display_name: adapter.display_name.clone(),
                installed: adapter.is_installed(),
                enabled: !disabled.contains(&adapter.key),
                managed: target.is_some_and(|target| Path::new(&target.target_path) == path),
                location: inspect_location(&path, &bundled_version),
            }
        })
        .collect();

    Ok(AgentControlStatus {
        bundled_version: bundled_version.to_string(),
        library_skill_id: skill.map(|skill| skill.id.clone()),
        library_source_type: skill.map(|skill| skill.source_type.clone()),
        library_update_available: skill
            .is_some_and(|skill| skill.update_status == "update_available"),
        library: inspect_location(&library_path, &bundled_version),
        agents,
    })
}

#[tauri::command]
pub async fn get_agent_control_status(
    store: State<'_, Arc<SkillStore>>,
) -> Result<AgentControlStatus, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || inspect(&store)).await?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checks_the_real_skill_directory_and_its_version() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join(SKILL_NAME);
        let bundled = skill_metadata::parse_frontmatter(BUNDLED_SKILL)
            .version
            .map(|version| Version::parse(&version).unwrap())
            .unwrap();
        assert!(!inspect_location(&path, &bundled).present);

        std::fs::create_dir(&path).unwrap();
        std::fs::write(
            path.join("SKILL.md"),
            "---\nname: agent-hub-cli\nversion: 1.0.0\n---\n",
        )
        .unwrap();
        let installed = inspect_location(&path, &bundled);
        assert!(installed.present);
        assert!(installed.outdated);

        std::fs::write(
            path.join("SKILL.md"),
            format!("---\nname: agent-hub-cli\nversion: {bundled}\n---\n"),
        )
        .unwrap();
        assert!(!inspect_location(&path, &bundled).outdated);
        std::fs::write(path.join("SKILL.md"), "---\nname: other-skill\n---\n").unwrap();
        let occupied = inspect_location(&path, &bundled);
        assert!(occupied.occupied);
        assert!(!occupied.present);
        std::fs::remove_file(path.join("SKILL.md")).unwrap();
        assert!(!inspect_location(&path, &bundled).present);
    }
}
