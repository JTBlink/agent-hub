use super::{
    all_tool_adapters, default_tool_adapters, find_adapter_with_store, CustomToolDef, ToolCategory,
};
use crate::core::skill_store::SkillStore;

use tempfile::tempdir;

#[test]
fn explicit_destination_does_not_imply_installed_agent() {
    let tmp = tempdir().unwrap();
    let mut adapter = default_tool_adapters().remove(0);
    adapter.key = "fixture-uninstalled-agent".into();
    adapter.override_skills_dir = Some(tmp.path().to_string_lossy().into_owned());
    assert!(!adapter.is_installed());
    assert!(adapter.can_deploy());
    adapter.is_custom = true;
    assert!(!adapter.is_installed());
}

#[test]
fn antigravity_uses_current_default_skills_path() {
    let adapter = default_tool_adapters()
        .into_iter()
        .find(|adapter| adapter.key == "antigravity")
        .expect("antigravity adapter should exist");

    assert_eq!(adapter.relative_skills_dir, ".gemini/antigravity/skills");
}

#[test]
fn claude_code_does_not_scan_plugin_marketplaces_by_default() {
    let adapter = default_tool_adapters()
        .into_iter()
        .find(|adapter| adapter.key == "claude_code")
        .expect("claude_code adapter should exist");

    assert!(adapter.additional_scan_dirs.is_empty());
}

#[test]
fn omp_agent_uses_expected_default_paths() {
    let adapter = default_tool_adapters()
        .into_iter()
        .find(|adapter| adapter.key == "omp_agent")
        .expect("omp_agent adapter should exist");

    assert_eq!(adapter.display_name, "OMP Agent");
    assert_eq!(adapter.relative_skills_dir, ".omp/agent/skills");
    assert_eq!(adapter.relative_detect_dir, ".omp/agent");
    assert!(adapter.additional_scan_dirs.is_empty());
    assert_eq!(adapter.category, ToolCategory::Coding);
    assert!(!adapter.is_custom);
    assert!(!adapter.recursive_scan);
    assert_eq!(
        adapter.project_relative_skills_dir.as_deref(),
        Some(".omp/skills")
    );
    assert_eq!(adapter.project_relative_skills_dir(), ".omp/skills");
}

#[test]
fn custom_omp_agent_collision_keeps_builtin_adapter() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
    let custom_skills = tmp.path().join("custom-skills");
    let custom_project_path = ".custom/skills";
    let custom_tools = vec![
        CustomToolDef {
            key: "omp_agent".to_string(),
            display_name: "Legacy Custom OMP".to_string(),
            skills_dir: tmp
                .path()
                .join("legacy-skills")
                .to_string_lossy()
                .into_owned(),
            project_relative_skills_dir: Some(".legacy/skills".to_string()),
            category: ToolCategory::Lobster,
        },
        CustomToolDef {
            key: "custom_agent".to_string(),
            display_name: "Custom Agent".to_string(),
            skills_dir: custom_skills.to_string_lossy().into_owned(),
            project_relative_skills_dir: Some(custom_project_path.to_string()),
            category: ToolCategory::Lobster,
        },
    ];
    store
        .set_setting(
            "custom_tools",
            &serde_json::to_string(&custom_tools).unwrap(),
        )
        .unwrap();

    let adapters = all_tool_adapters(&store);
    let matching_adapters: Vec<_> = adapters
        .iter()
        .filter(|adapter| adapter.key == "omp_agent")
        .collect();
    assert_eq!(matching_adapters.len(), 1);

    let adapter = matching_adapters[0];
    assert_eq!(adapter.display_name, "OMP Agent");
    assert!(!adapter.is_custom);
    assert_eq!(adapter.category, ToolCategory::Coding);
    assert_eq!(adapter.relative_skills_dir, ".omp/agent/skills");
    assert_eq!(adapter.relative_detect_dir, ".omp/agent");
    assert_eq!(adapter.project_relative_skills_dir(), ".omp/skills");

    let custom_adapter = adapters
        .iter()
        .find(|adapter| adapter.key == "custom_agent")
        .unwrap();
    assert_eq!(custom_adapter.display_name, "Custom Agent");
    assert!(custom_adapter.is_custom);
    assert_eq!(custom_adapter.category, ToolCategory::Lobster);
    assert_eq!(custom_adapter.skills_dir(), custom_skills);
    assert_eq!(
        custom_adapter.project_relative_skills_dir(),
        custom_project_path
    );

    let found = find_adapter_with_store(&store, "omp_agent").unwrap();
    assert_eq!(found.display_name, "OMP Agent");
    assert!(!found.is_custom);
    assert_eq!(found.category, ToolCategory::Coding);
    assert_eq!(found.relative_skills_dir, ".omp/agent/skills");
    assert_eq!(found.relative_detect_dir, ".omp/agent");
    assert_eq!(found.project_relative_skills_dir(), ".omp/skills");
}

/// Paths verified against the harness source rather than its README:
/// `packages/util/home-paths/src/index.ts` for the home, and
/// `packages/skill/skill-filesystem/src/index.ts` for the root list.
#[test]
fn deepseek_harness_deploys_to_its_own_home_and_discovers_the_shared_root() {
    let adapter = default_tool_adapters()
        .into_iter()
        .find(|adapter| adapter.key == "deepseek_harness")
        .expect("deepseek_harness adapter should exist");

    assert_eq!(adapter.relative_skills_dir, ".dsh/skills");
    assert_eq!(adapter.relative_detect_dir, ".dsh");
    // The project root it ranks highest is `<project>/.dsh/skills`, which
    // matches the global path, so it needs no override.
    assert_eq!(adapter.project_relative_skills_dir(), ".dsh/skills");
    // Shared root: discovery only, never a deploy target.
    assert!(adapter
        .additional_scan_dirs
        .contains(&".agents/skills".to_string()));
    assert!(!adapter.is_custom);
    assert_eq!(adapter.category, ToolCategory::Coding);
}

/// Paths verified against the `AgentSkillsResolver` in the bundled Duo CLI
/// binary rather than the GitLab docs: the config home is
/// `$XDG_CONFIG_HOME/gitlab/duo` or `~/.gitlab/duo`, global skills sit in
/// `skills` beneath it, and `~/.agents/skills` is a second global root.
#[test]
fn gitlab_duo_deploys_to_its_config_home_and_discovers_the_shared_root() {
    let adapter = default_tool_adapters()
        .into_iter()
        .find(|adapter| adapter.key == "gitlab_duo")
        .expect("gitlab_duo adapter should exist");

    assert_eq!(adapter.display_name, "GitLab Duo");
    assert_eq!(adapter.relative_skills_dir, ".gitlab/duo/skills");
    assert_eq!(adapter.relative_detect_dir, ".gitlab/duo");
    // Duo's other project root is a bare `<repo>/skills`, which would claim
    // any unrelated directory of that name, so the project target is the
    // spec-compliant one and differs from the global path.
    assert_eq!(adapter.project_relative_skills_dir(), ".agents/skills");
    // Shared root: discovery only, never a deploy target.
    assert!(adapter
        .additional_scan_dirs
        .contains(&".agents/skills".to_string()));
    assert_eq!(adapter.category, ToolCategory::Coding);
    assert!(!adapter.is_custom);
    assert!(!adapter.recursive_scan);
}

#[test]
fn opencode_uses_distinct_project_and_global_skill_paths() {
    let adapter = default_tool_adapters()
        .into_iter()
        .find(|adapter| adapter.key == "opencode")
        .expect("opencode adapter should exist");

    // Global path under home: ~/.config/opencode/skills
    assert_eq!(adapter.relative_skills_dir, ".config/opencode/skills");
    // Project path under workspace: .opencode/skills
    assert_eq!(adapter.project_relative_skills_dir(), ".opencode/skills");
}

#[test]
fn zcode_uses_expected_default_paths() {
    let adapter = default_tool_adapters()
        .into_iter()
        .find(|adapter| adapter.key == "zcode")
        .expect("zcode adapter should exist");

    assert_eq!(adapter.display_name, "ZCode");
    assert_eq!(adapter.relative_skills_dir, ".zcode/skills");
    assert_eq!(adapter.relative_detect_dir, ".zcode");
    assert_eq!(adapter.project_relative_skills_dir(), ".zcode/skills");
    assert_eq!(adapter.category, ToolCategory::Coding);
    assert!(!adapter.is_custom);
    assert!(!adapter.recursive_scan);
    assert!(adapter.additional_scan_dirs.is_empty());
}
