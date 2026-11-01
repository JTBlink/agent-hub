use super::{read_linked_workspace_skills, read_project_skills, AgentSkillConfig};
use std::fs;
use tempfile::tempdir;

#[test]
fn reads_nested_project_skills_recursively() {
    let tmp = tempdir().unwrap();
    let root = tmp.path().join(".hermes").join("skills");
    let nested_skill = root.join("research").join("web-search");
    fs::create_dir_all(&nested_skill).unwrap();
    fs::write(
        nested_skill.join("SKILL.md"),
        "---\nname: Web Search\ndescription: Nested skill\n---\n",
    )
    .unwrap();

    let configs = vec![AgentSkillConfig {
        key: "hermes".to_string(),
        display_name: "Hermes".to_string(),
        relative_skills_dir: ".hermes/skills".to_string(),
    }];

    let skills = read_project_skills(tmp.path(), &configs);
    assert_eq!(skills.len(), 1);
    assert_eq!(skills[0].dir_name, "web-search");
    assert_eq!(skills[0].relative_path, "research/web-search");
    assert_eq!(skills[0].name, "Web Search");
}

#[test]
fn prefers_skill_dir_over_namespace_parent_dir() {
    let tmp = tempdir().unwrap();
    let root = tmp.path().join(".hermes").join("skills");
    let namespace = root.join("research");
    let nested_skill = namespace.join("web-search");
    fs::create_dir_all(&nested_skill).unwrap();
    fs::write(namespace.join("notes.txt"), "namespace").unwrap();
    fs::write(nested_skill.join("SKILL.md"), "# Nested").unwrap();

    let configs = vec![AgentSkillConfig {
        key: "hermes".to_string(),
        display_name: "Hermes".to_string(),
        relative_skills_dir: ".hermes/skills".to_string(),
    }];

    let skills = read_project_skills(tmp.path(), &configs);
    assert_eq!(skills.len(), 1);
    assert_eq!(skills[0].relative_path, "research/web-search");
}

#[test]
fn linked_workspace_skips_hidden_dirs_and_embedded_bundle_skills() {
    let tmp = tempdir().unwrap();
    let skills_root = tmp.path().join("skills");
    let disabled_root = tmp.path().join("skills-disabled");

    let top_level_skill = skills_root.join("understand");
    fs::create_dir_all(&top_level_skill).unwrap();
    fs::write(
        top_level_skill.join("SKILL.md"),
        "---\nname: understand\n---\n",
    )
    .unwrap();

    let hidden_skill = skills_root
        .join(".claude")
        .join("skills")
        .join("hidden-skill");
    fs::create_dir_all(&hidden_skill).unwrap();
    fs::write(
        hidden_skill.join("SKILL.md"),
        "---\nname: hidden-skill\n---\n",
    )
    .unwrap();

    let embedded_enabled = skills_root
        .join("understand-anything")
        .join("understand-anything")
        .join("311f2ad1aca5")
        .join("skills")
        .join("understand");
    fs::create_dir_all(&embedded_enabled).unwrap();
    fs::write(
        embedded_enabled.join("SKILL.md"),
        "---\nname: understand\n---\n",
    )
    .unwrap();

    let disabled_skill = disabled_root.join("understand-diff");
    fs::create_dir_all(&disabled_skill).unwrap();
    fs::write(
        disabled_skill.join("SKILL.md"),
        "---\nname: understand-diff\n---\n",
    )
    .unwrap();

    let embedded_disabled = disabled_root
        .join("claude-plugins-official")
        .join("superpowers")
        .join("5.0.7")
        .join("skills")
        .join("brainstorming");
    fs::create_dir_all(&embedded_disabled).unwrap();
    fs::write(
        embedded_disabled.join("SKILL.md"),
        "---\nname: brainstorming\n---\n",
    )
    .unwrap();

    let skills =
        read_linked_workspace_skills(&skills_root, Some(&disabled_root), "linked", "Linked", true);

    let names: Vec<&str> = skills.iter().map(|skill| skill.name.as_str()).collect();
    assert_eq!(names, vec!["understand", "understand-diff"]);
    assert_eq!(
        skills
            .iter()
            .filter(|skill| skill.name == "understand")
            .count(),
        1
    );
    assert!(skills
        .iter()
        .any(|skill| skill.name == "understand" && skill.enabled));
    assert!(skills
        .iter()
        .any(|skill| skill.name == "understand-diff" && !skill.enabled));
}

#[test]
fn linked_workspace_flat_scan_ignores_nested_skills() {
    let tmp = tempdir().unwrap();
    let skills_root = tmp.path().join("skills");

    let top_level_skill = skills_root.join("codex-tool");
    fs::create_dir_all(&top_level_skill).unwrap();
    fs::write(
        top_level_skill.join("SKILL.md"),
        "---\nname: codex-tool\n---\n",
    )
    .unwrap();

    let nested_skill = skills_root.join("vendor").join("nested-tool");
    fs::create_dir_all(&nested_skill).unwrap();
    fs::write(
        nested_skill.join("SKILL.md"),
        "---\nname: nested-tool\n---\n",
    )
    .unwrap();

    let skills = read_linked_workspace_skills(&skills_root, None, "codex", "Codex", false);

    assert_eq!(skills.len(), 1);
    assert_eq!(skills[0].name, "codex-tool");
}
