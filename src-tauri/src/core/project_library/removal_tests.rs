use super::{
    tests::{fixture, TestProject},
    *,
};
use crate::core::tool_adapters;

fn managed_project(tmp: &TestProject) -> (PathBuf, SkillRecord) {
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir(&root).unwrap();
    install(
        &root,
        &skill,
        &[tool_adapters::find_adapter("cline").unwrap()],
    )
    .unwrap();
    assert!(!manifest::read(&root).unwrap().skills["demo"]
        .targets
        .contains_key("codex"));
    (root, skill)
}

#[cfg(unix)]
#[test]
fn removes_unrecorded_personal_links_without_touching_source_or_other_agents() {
    let tmp = TestProject::new();
    let (root, skill) = managed_project(&tmp);
    for directory in [".codex/skills", ".opencode/skills", ".hermes/skills"] {
        fs::create_dir_all(root.join(directory)).unwrap();
        std::os::unix::fs::symlink(&skill.central_path, root.join(directory).join("demo")).unwrap();
    }
    let source_before = fingerprint(Path::new(&skill.central_path)).unwrap();
    let central_before = fingerprint(&root.join(".agents/skills/demo")).unwrap();
    let configs: Vec<_> = ["codex", "opencode", "hermes"]
        .iter()
        .map(|agent| {
            let adapter = tool_adapters::find_adapter(agent).unwrap();
            crate::core::project_scanner::AgentSkillConfig {
                key: adapter.key.clone(),
                display_name: adapter.display_name.clone(),
                relative_skills_dir: adapter.project_relative_skills_dir().into(),
            }
        })
        .collect();
    assert_eq!(
        crate::core::project_scanner::read_project_skills(&root, &configs).len(),
        3
    );
    for (agent, directory) in [
        ("codex", ".codex/skills"),
        ("opencode", ".opencode/skills"),
        ("hermes", ".hermes/skills"),
    ] {
        remove_target(&root, "demo", agent).unwrap();
        assert!(fs::symlink_metadata(root.join(directory).join("demo")).is_err());
        assert!(
            crate::core::project_scanner::read_project_skills(&root, &configs)
                .iter()
                .all(|entry| entry.agent != agent)
        );
        assert_eq!(
            fingerprint(Path::new(&skill.central_path)).unwrap(),
            source_before
        );
        assert_eq!(
            fingerprint(&root.join(".agents/skills/demo")).unwrap(),
            central_before
        );
    }
}

#[test]
fn removes_unrecorded_entry_using_a_custom_project_adapter() {
    let tmp = TestProject::new();
    let (root, _) = managed_project(&tmp);
    let mut adapter = tool_adapters::find_adapter("codex").unwrap();
    adapter.key = "custom_agent".into();
    adapter.project_relative_skills_dir = Some(".custom/skills".into());
    transaction::copy_project_content(
        &root.join(".agents/skills/demo"),
        &root.join(".custom/skills/demo"),
    )
    .unwrap();
    remove_target_with_adapter(&root, "demo", &adapter).unwrap();
    assert!(!root.join(".custom/skills/demo").exists());
    assert!(root.join(".agents/skills/demo/SKILL.md").is_file());
}

#[test]
fn removes_unrecorded_enabled_and_disabled_copies() {
    let tmp = TestProject::new();
    let (root, _) = managed_project(&tmp);
    for directory in [".codex/skills", ".codex/skills-disabled"] {
        transaction::copy_project_content(
            &root.join(".agents/skills/demo"),
            &root.join(directory).join("demo"),
        )
        .unwrap();
    }
    remove_target(&root, "demo", "codex").unwrap();
    assert!(!root.join(".codex/skills/demo").exists());
    assert!(!root.join(".codex/skills-disabled/demo").exists());
    remove_target(&root, "demo", "codex").unwrap();
    assert!(root.join(".agents/skills/demo/SKILL.md").is_file());
}

#[cfg(unix)]
#[test]
fn removes_unrecorded_project_relative_and_broken_links() {
    let tmp = TestProject::new();
    let (root, _) = managed_project(&tmp);
    for (directory, destination) in [
        (".codex/skills", "../../.agents/skills/demo"),
        (".codex/skills-disabled", "../../missing/demo"),
    ] {
        fs::create_dir_all(root.join(directory)).unwrap();
        std::os::unix::fs::symlink(destination, root.join(directory).join("demo")).unwrap();
    }
    remove_target(&root, "demo", "codex").unwrap();
    assert!(!root.join(".codex/skills/demo").is_symlink());
    assert!(!root.join(".codex/skills-disabled/demo").is_symlink());
    assert!(root.join(".agents/skills/demo/SKILL.md").is_file());
}

#[test]
fn preserves_modified_unrecorded_copies_and_the_manifest() {
    let tmp = TestProject::new();
    let (root, _) = managed_project(&tmp);
    transaction::copy_project_content(
        &root.join(".agents/skills/demo"),
        &root.join(".codex/skills/demo"),
    )
    .unwrap();
    fs::write(root.join(".codex/skills/demo/local.txt"), "local edits").unwrap();
    let before = fs::read(root.join(MANIFEST)).unwrap();
    assert!(remove_target(&root, "demo", "codex").is_err());
    assert!(root.join(".codex/skills/demo/local.txt").is_file());
    assert_eq!(fs::read(root.join(MANIFEST)).unwrap(), before);
}

#[test]
fn refuses_unrecorded_shared_library_removal_and_unknown_agents() {
    let tmp = TestProject::new();
    let (root, _) = managed_project(&tmp);
    assert!(remove_target(&root, "demo", "warp").is_err());
    assert!(remove_target(&root, "demo", "unknown_agent").is_err());
    assert!(root.join(".agents/skills/demo/SKILL.md").is_file());
}

#[cfg(unix)]
#[test]
fn unrecorded_removal_refuses_link_ancestors() {
    let tmp = TestProject::new();
    let (root, skill) = managed_project(&tmp);
    fs::create_dir_all(root.join(".codex")).unwrap();
    std::os::unix::fs::symlink(tmp.path().join("personal"), root.join(".codex/skills")).unwrap();
    assert!(remove_target(&root, "demo", "codex").is_err());
    assert!(Path::new(&skill.central_path).join("SKILL.md").is_file());
}

#[cfg(unix)]
#[test]
fn failed_unrecorded_removal_restores_the_original_personal_link() {
    let tmp = TestProject::new();
    let (root, skill) = managed_project(&tmp);
    fs::create_dir_all(root.join(".codex/skills")).unwrap();
    std::os::unix::fs::symlink(&skill.central_path, root.join(".codex/skills/demo")).unwrap();
    let before = fs::read(root.join(MANIFEST)).unwrap();
    transaction::FAIL_AFTER.with(|value| value.set(Some(1)));
    let result = remove_target(&root, "demo", "codex");
    transaction::FAIL_AFTER.with(|value| value.set(None));
    assert!(result.is_err());
    assert_eq!(
        fs::read_link(root.join(".codex/skills/demo")).unwrap(),
        Path::new(&skill.central_path)
    );
    assert_eq!(fs::read(root.join(MANIFEST)).unwrap(), before);
    assert!(Path::new(&skill.central_path).join("SKILL.md").is_file());
}
