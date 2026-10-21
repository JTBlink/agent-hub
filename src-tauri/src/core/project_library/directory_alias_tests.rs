#![cfg(unix)]
use super::{
    tests::{fixture, TestProject},
    *,
};
use crate::core::tool_adapters;

#[test]
fn installing_through_project_central_directory_alias_preserves_the_alias() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir_all(root.join(".agents/skills")).unwrap();
    fs::create_dir_all(root.join(".claude")).unwrap();
    std::os::unix::fs::symlink("../.agents/skills", root.join(".claude/skills")).unwrap();
    let result = install(
        &root,
        &skill,
        &[tool_adapters::find_adapter("claude_code").unwrap()],
    );
    assert!(
        result.is_ok(),
        "Installation should accept a project central directory alias: {}",
        result.err().map(|error| error.message).unwrap_or_default()
    );
    assert!(root.join(".claude/skills").is_symlink());
    assert!(!root.join(".agents/skills/demo").is_symlink());
    assert_eq!(
        fs::read_to_string(root.join(".claude/skills/demo/scripts/run.sh")).unwrap(),
        "echo team\n"
    );
}

#[test]
fn shared_directory_aliases_support_install_update_disable_and_removal() {
    for copy in [false, true] {
        let tmp = TestProject::new();
        let skill = fixture(tmp.path());
        let root = tmp.path().join("project");
        // The central directory need not exist before the first install.
        for agent in [".claude", ".codex"] {
            fs::create_dir_all(root.join(agent)).unwrap();
            std::os::unix::fs::symlink("../.agents/skills", root.join(agent).join("skills"))
                .unwrap();
        }
        let targets: Vec<_> = ["claude_code", "codex", "opencode"]
            .iter()
            .map(|key| tool_adapters::find_adapter(key).unwrap())
            .collect();
        install_with_mode(&root, &skill, &targets, copy).unwrap();
        let manifest = manifest::read(&root).unwrap();
        for agent in ["claude_code", "codex"] {
            assert_eq!(
                manifest.skills["demo"].targets[agent],
                ".agents/skills/demo"
            );
            assert!(!manifest.skills["demo"].linked_targets.contains(agent));
        }
        // Reinstallation must reuse the project version and never link it to itself.
        fs::write(root.join(".agents/skills/demo/team.txt"), "Team version").unwrap();
        install_with_mode(&root, &skill, &targets, copy).unwrap();
        assert_eq!(
            fs::read_to_string(root.join(".claude/skills/demo/team.txt")).unwrap(),
            "Team version"
        );
        repair(&root, "demo").unwrap();
        fs::write(
            Path::new(&skill.central_path).join("scripts/run.sh"),
            "echo updated\n",
        )
        .unwrap();
        update(&root, "demo", &skill, false).unwrap();
        assert_eq!(
            fs::read_to_string(root.join(".codex/skills/demo/scripts/run.sh")).unwrap(),
            "echo updated\n"
        );
        assert!(remove_target(&root, "demo", "claude_code").is_err());
        set_target_enabled(&root, "demo", "claude_code", false).unwrap();
        assert!(root.join(".agents/skills-disabled/demo/SKILL.md").is_file());
        set_target_enabled(&root, "demo", "codex", true).unwrap();
        assert!(status(&root).unwrap().skills[0].target_issues.is_empty());
        remove(&root, "demo").unwrap();
        assert!(!root.join(".agents/skills/demo").exists());
        assert!(root.join(".claude/skills").is_symlink());
        assert!(root.join(".codex/skills").is_symlink());
        assert!(Path::new(&skill.central_path).join("SKILL.md").is_file());
    }
}

#[test]
fn external_directory_alias_is_rejected_without_publishing_or_touching_source() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    let outside = tmp.path().join("external");
    fs::create_dir_all(&outside).unwrap();
    fs::write(outside.join("keep.txt"), "Existing external contents").unwrap();
    fs::create_dir_all(root.join(".claude")).unwrap();
    std::os::unix::fs::symlink(&outside, root.join(".claude/skills")).unwrap();
    assert!(install(
        &root,
        &skill,
        &[tool_adapters::find_adapter("claude_code").unwrap()]
    )
    .is_err());
    assert!(!root.join(".agents/skills/demo").exists());
    assert!(!root.join(MANIFEST).exists());
    assert!(!outside.join("demo").exists());
    assert_eq!(
        fs::read_to_string(outside.join("keep.txt")).unwrap(),
        "Existing external contents"
    );
    assert!(root.join(".claude/skills").is_symlink());
}

#[test]
fn existing_manifest_accepts_an_active_entry_now_shared_through_a_directory_alias() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir(&root).unwrap();
    let targets = [tool_adapters::find_adapter("claude_code").unwrap()];
    install(&root, &skill, &targets).unwrap();
    fs::remove_file(root.join(".claude/skills/demo")).unwrap();
    fs::remove_dir(root.join(".claude/skills")).unwrap();
    std::os::unix::fs::symlink("../.agents/skills", root.join(".claude/skills")).unwrap();
    let before = fs::read(root.join(MANIFEST)).unwrap();
    assert!(status(&root).unwrap().skills[0].target_issues.is_empty());
    assert_eq!(fs::read(root.join(MANIFEST)).unwrap(), before);
    install(&root, &skill, &targets).unwrap();
    assert_eq!(
        manifest::read(&root).unwrap().skills["demo"].targets["claude_code"],
        ".agents/skills/demo"
    );
    assert!(!root.join(".agents/skills/demo").is_symlink());
}
