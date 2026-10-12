use super::{
    entries::path,
    tests::{fixture, TestProject},
    *,
};
use crate::core::{error::ErrorKind, tool_adapters};

#[test]
fn confirmed_restore_replaces_local_changes_without_readding_absent_agents() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir(&root).unwrap();
    install_with_mode(
        &root,
        &skill,
        &[
            tool_adapters::find_adapter("claude_code").unwrap(),
            tool_adapters::find_adapter("codex").unwrap(),
        ],
        true,
    )
    .unwrap();
    set_target_enabled(&root, "demo", "claude_code", false).unwrap();
    fs::remove_dir_all(path(&root, ".codex/skills/demo").unwrap()).unwrap();
    fs::write(
        path(&root, ".agents/skills/demo/local.txt").unwrap(),
        "project edit",
    )
    .unwrap();
    fs::write(
        path(&root, ".claude/skills-disabled/demo/local.txt").unwrap(),
        "Agent edit",
    )
    .unwrap();
    let manifest_before = fs::read(root.join(MANIFEST)).unwrap();
    let error = update(&root, "demo", &skill, false).err().unwrap();
    assert_eq!(error.kind, ErrorKind::ProjectRestoreRequired);
    assert_eq!(fs::read(root.join(MANIFEST)).unwrap(), manifest_before);
    assert!(path(&root, ".agents/skills/demo/local.txt")
        .unwrap()
        .is_file());
    let report = update(&root, "demo", &skill, true).unwrap();
    assert!(!report.skills[0].modified);
    assert!(report.skills[0].target_issues.is_empty());
    assert!(!path(&root, ".agents/skills/demo/local.txt")
        .unwrap()
        .exists());
    assert!(!path(&root, ".claude/skills-disabled/demo/local.txt")
        .unwrap()
        .exists());
    assert!(path(&root, ".claude/skills-disabled/demo/SKILL.md")
        .unwrap()
        .is_file());
    assert!(!path(&root, ".claude/skills/demo").unwrap().exists());
    assert!(!path(&root, ".codex/skills/demo").unwrap().exists());
    assert!(Path::new(&skill.central_path).join("SKILL.md").is_file());
}

#[cfg(unix)]
#[test]
fn confirmed_restore_preserves_project_links_and_shared_disabled_state() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir(&root).unwrap();
    install(
        &root,
        &skill,
        &[tool_adapters::find_adapter("claude_code").unwrap()],
    )
    .unwrap();
    set_enabled(&root, "demo", false).unwrap();
    fs::write(
        path(&root, ".agents/skills-disabled/demo/local.txt").unwrap(),
        "project edit",
    )
    .unwrap();
    let report = update(&root, "demo", &skill, true).unwrap();
    assert!(report.skills[0].disabled);
    let link = path(&root, ".claude/skills-disabled/demo").unwrap();
    assert!(link.is_symlink());
    assert!(link.join("SKILL.md").is_file());
    assert_eq!(
        fs::read_link(link).unwrap(),
        Path::new("../../.agents/skills-disabled/demo")
    );
    assert!(!path(&root, ".agents/skills/demo").unwrap().exists());
}

#[cfg(unix)]
#[test]
fn forced_restore_refuses_external_links_and_preserves_every_source() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir(&root).unwrap();
    install(
        &root,
        &skill,
        &[tool_adapters::find_adapter("claude_code").unwrap()],
    )
    .unwrap();
    let target = path(&root, ".claude/skills/demo").unwrap();
    fs::remove_file(&target).unwrap();
    let outside = tmp.path().join("outside");
    fs::create_dir(&outside).unwrap();
    fs::write(outside.join("SKILL.md"), "outside source").unwrap();
    std::os::unix::fs::symlink(&outside, &target).unwrap();
    let before = fs::read(path(&root, ".agents/skills/demo/SKILL.md").unwrap()).unwrap();
    assert!(update(&root, "demo", &skill, true).is_err());
    assert_eq!(
        fs::read(path(&root, ".agents/skills/demo/SKILL.md").unwrap()).unwrap(),
        before
    );
    assert_eq!(
        fs::read_to_string(outside.join("SKILL.md")).unwrap(),
        "outside source"
    );
    assert!(target.is_symlink());
}

#[test]
fn forced_restore_rolls_back_modified_project_content_and_manifest_after_publication_failure() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir(&root).unwrap();
    install_with_mode(
        &root,
        &skill,
        &[tool_adapters::find_adapter("claude_code").unwrap()],
        true,
    )
    .unwrap();
    fs::write(
        path(&root, ".agents/skills/demo/local.txt").unwrap(),
        "project edit",
    )
    .unwrap();
    let manifest_before = fs::read(root.join(MANIFEST)).unwrap();
    transaction::FAIL_AFTER.with(|value| value.set(Some(1)));
    let result = update(&root, "demo", &skill, true);
    transaction::FAIL_AFTER.with(|value| value.set(None));
    assert!(result.is_err());
    assert_eq!(
        fs::read_to_string(path(&root, ".agents/skills/demo/local.txt").unwrap()).unwrap(),
        "project edit"
    );
    assert_eq!(fs::read(root.join(MANIFEST)).unwrap(), manifest_before);
    update(&root, "demo", &skill, true).unwrap();
    assert!(!path(&root, ".agents/skills/demo/local.txt")
        .unwrap()
        .exists());
}

#[test]
fn forced_restore_refuses_a_non_skill_replacement() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir(&root).unwrap();
    install_with_mode(
        &root,
        &skill,
        &[tool_adapters::find_adapter("claude_code").unwrap()],
        true,
    )
    .unwrap();
    let target = path(&root, ".claude/skills/demo").unwrap();
    fs::remove_file(target.join("SKILL.md")).unwrap();
    fs::write(target.join("keep.txt"), "unrelated files").unwrap();
    assert!(update(&root, "demo", &skill, true).is_err());
    assert_eq!(
        fs::read_to_string(target.join("keep.txt")).unwrap(),
        "unrelated files"
    );
}
