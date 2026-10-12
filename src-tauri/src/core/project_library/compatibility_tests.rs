use super::{
    tests::{fixture, TestProject},
    *,
};
use crate::core::tool_adapters;

#[test]
fn installed_project_links_are_readable_and_use_native_destination_separators() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir(&root).unwrap();
    let targets: Vec<_> = ["claude_code", "codex", "hermes", "opencode"]
        .iter()
        .map(|key| tool_adapters::find_adapter(key).unwrap())
        .collect();
    let report = install(&root, &skill, &targets).unwrap();
    assert!(report.skills[0].target_issues.is_empty());
    for adapter in &targets {
        let relative = format!("{}/demo", adapter.project_relative_skills_dir());
        let target = entries::path(&root, &relative).unwrap();
        assert_eq!(
            fs::read(target.join("SKILL.md")).unwrap(),
            fs::read(
                root.join(".agents")
                    .join("skills")
                    .join("demo")
                    .join("SKILL.md")
            )
            .unwrap()
        );
        if target.is_symlink() {
            let destination = fs::read_link(&target).unwrap();
            assert!(!destination.is_absolute());
            #[cfg(windows)]
            assert!(!destination.to_string_lossy().contains('/'));
        }
    }
    repair(&root, "demo").unwrap();
    for adapter in &targets {
        let relative = format!("{}/demo", adapter.project_relative_skills_dir());
        let target = entries::path(&root, &relative).unwrap();
        assert!(target.join("SKILL.md").is_file());
    }
}

#[cfg(unix)]
#[test]
fn new_agent_uses_default_links_while_existing_copy_is_preserved() {
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
    deploy(
        &root,
        "demo",
        &[tool_adapters::find_adapter("codex").unwrap()],
    )
    .unwrap();
    assert!(!root.join(".claude/skills/demo").is_symlink());
    assert!(root.join(".codex/skills/demo").is_symlink());
    assert!(root.join(".codex/skills/demo/scripts/run.sh").is_file());
    assert_eq!(
        manifest::read(&root).unwrap().skills["demo"].linked_targets,
        BTreeSet::from(["codex".into()])
    );
}

#[test]
fn installing_existing_project_content_keeps_the_team_version() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    let central = root.join(".agents/skills/demo");
    fs::create_dir_all(&central).unwrap();
    fs::write(
        central.join("SKILL.md"),
        "---\nname: demo\n---\n# Team changes\n",
    )
    .unwrap();
    fs::write(central.join("team.txt"), "Project-only content").unwrap();
    install(
        &root,
        &skill,
        &[tool_adapters::find_adapter("claude_code").unwrap()],
    )
    .unwrap();
    assert_eq!(
        fs::read_to_string(central.join("team.txt")).unwrap(),
        "Project-only content"
    );
    assert_eq!(
        fs::read_to_string(
            root.join(".claude")
                .join("skills")
                .join("demo")
                .join("SKILL.md")
        )
        .unwrap(),
        fs::read_to_string(central.join("SKILL.md")).unwrap()
    );
    assert!(Path::new(&skill.central_path)
        .join("scripts/run.sh")
        .exists());
}

#[cfg(unix)]
#[test]
fn installing_legacy_personal_link_materializes_the_project_central_without_touching_source() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir_all(root.join(".agents/skills")).unwrap();
    let canonical = root.join(".agents/skills/demo");
    std::os::unix::fs::symlink(&skill.central_path, &canonical).unwrap();
    install(
        &root,
        &skill,
        &[tool_adapters::find_adapter("claude_code").unwrap()],
    )
    .unwrap();
    assert!(!canonical.is_symlink());
    assert!(Path::new(&skill.central_path).join("SKILL.md").exists());
    fs::remove_dir_all(tmp.path().join("personal")).unwrap();
    assert_eq!(
        fs::read_to_string(root.join(".claude/skills/demo/scripts/run.sh")).unwrap(),
        "echo team\n"
    );
}

#[cfg(unix)]
#[test]
fn installing_reuses_npx_skills_project_relative_entry() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir_all(root.join(".agents/skills")).unwrap();
    transaction::copy_project_content(
        Path::new(&skill.central_path),
        &root.join(".agents/skills/demo"),
    )
    .unwrap();
    fs::create_dir_all(root.join(".claude/skills")).unwrap();
    std::os::unix::fs::symlink(
        "../../.agents/skills/demo",
        root.join(".claude/skills/demo"),
    )
    .unwrap();
    install(
        &root,
        &skill,
        &[tool_adapters::find_adapter("claude_code").unwrap()],
    )
    .unwrap();
    assert!(root.join(".claude/skills/demo/SKILL.md").is_file());
    assert!(status(&root).unwrap().skills[0].stale_targets.is_empty());
}

#[cfg(unix)]
#[test]
fn project_relative_entries_follow_central_edits_and_survive_the_full_lifecycle() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir(&root).unwrap();
    let claude = tool_adapters::find_adapter("claude_code").unwrap();
    let codex = tool_adapters::find_adapter("codex").unwrap();
    install(&root, &skill, &[claude, codex]).unwrap();
    assert!(!root.join(".agents/skills/demo").is_symlink());
    assert_eq!(
        fs::read_link(root.join(".claude/skills/demo")).unwrap(),
        Path::new("../../.agents/skills/demo")
    );
    fs::write(root.join(".agents/skills/demo/team.txt"), "Team version").unwrap();
    assert_eq!(
        fs::read_to_string(root.join(".claude/skills/demo/team.txt")).unwrap(),
        "Team version"
    );
    repair(&root, "demo").unwrap();
    assert!(!status(&root).unwrap().skills[0].modified);
    set_target_enabled(&root, "demo", "claude_code", false).unwrap();
    assert!(root.join(".claude/skills-disabled/demo/team.txt").is_file());
    assert!(root.join(".agents/skills/demo/team.txt").is_file());
    set_target_enabled(&root, "demo", "claude_code", true).unwrap();
    set_enabled(&root, "demo", false).unwrap();
    assert!(!root.join(".agents/skills/demo").exists());
    assert!(root.join(".claude/skills-disabled/demo/team.txt").is_file());
    set_enabled(&root, "demo", true).unwrap();
    remove_target(&root, "demo", "claude_code").unwrap();
    assert!(root.join(".agents/skills/demo/team.txt").is_file());
    remove(&root, "demo").unwrap();
    assert!(!root.join(".agents/skills/demo").exists());
    assert!(Path::new(&skill.central_path).join("SKILL.md").is_file());
}

#[cfg(unix)]
#[test]
fn a_failed_legacy_link_import_restores_the_original_link_and_leaves_no_entries() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir_all(root.join(".agents/skills")).unwrap();
    let canonical = root.join(".agents/skills/demo");
    std::os::unix::fs::symlink(&skill.central_path, &canonical).unwrap();
    transaction::FAIL_AFTER.with(|value| value.set(Some(1)));
    let result = install(
        &root,
        &skill,
        &[tool_adapters::find_adapter("claude_code").unwrap()],
    );
    transaction::FAIL_AFTER.with(|value| value.set(None));
    assert!(result.is_err());
    assert_eq!(
        fs::read_link(&canonical).unwrap(),
        Path::new(&skill.central_path)
    );
    assert!(!root.join(".claude/skills/demo").exists());
    assert!(!root.join(MANIFEST).exists());
    assert!(Path::new(&skill.central_path)
        .join("scripts/run.sh")
        .is_file());
}

#[cfg(unix)]
#[test]
fn installing_does_not_take_over_a_central_link_to_another_source() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    let other = tmp.path().join("other");
    fs::create_dir(&other).unwrap();
    fs::write(other.join("SKILL.md"), "# Other source").unwrap();
    fs::create_dir_all(root.join(".agents/skills")).unwrap();
    std::os::unix::fs::symlink(&other, root.join(".agents/skills/demo")).unwrap();
    assert!(install(
        &root,
        &skill,
        &[tool_adapters::find_adapter("claude_code").unwrap()]
    )
    .is_err());
    assert_eq!(
        fs::read_to_string(other.join("SKILL.md")).unwrap(),
        "# Other source"
    );
    assert!(root.join(".agents/skills/demo").is_symlink());
}

#[cfg(unix)]
#[test]
fn cloned_project_links_work_without_personal_source_or_manifest() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir(&root).unwrap();
    let repo = git2::Repository::init(&root).unwrap();
    fs::write(root.join(".gitignore"), ".agent-hub/\n").unwrap();
    install(
        &root,
        &skill,
        &[tool_adapters::find_adapter("claude_code").unwrap()],
    )
    .unwrap();
    let mut index = repo.index().unwrap();
    index
        .add_all(["."], git2::IndexAddOption::DEFAULT, None)
        .unwrap();
    index.write().unwrap();
    let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
    let signature = git2::Signature::now("Fixture", "user@example.invalid").unwrap();
    repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        "Project central",
        &tree,
        &[],
    )
    .unwrap();
    let cloned = tmp.path().join("new-member");
    git2::Repository::clone(root.to_str().unwrap(), &cloned).unwrap();
    fs::remove_dir_all(tmp.path().join("personal")).unwrap();
    assert!(!cloned.join(MANIFEST).exists());
    assert!(cloned.join(".claude/skills/demo").is_symlink());
    assert_eq!(
        fs::read_to_string(cloned.join(".claude/skills/demo/scripts/run.sh")).unwrap(),
        "echo team\n"
    );
}

#[cfg(unix)]
#[test]
fn update_failure_restores_broken_staged_link_backups_and_central_contents() {
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
    let old_manifest = fs::read(root.join(MANIFEST)).unwrap();
    fs::write(
        Path::new(&skill.central_path).join("scripts/run.sh"),
        "echo new\n",
    )
    .unwrap();
    transaction::FAIL_AFTER.with(|value| value.set(Some(2)));
    let result = update(&root, "demo", &skill);
    transaction::FAIL_AFTER.with(|value| value.set(None));
    assert!(result.is_err());
    assert!(root.join(".claude/skills/demo").is_symlink());
    assert_eq!(fs::read(root.join(MANIFEST)).unwrap(), old_manifest);
    assert_eq!(
        fs::read_to_string(root.join(".claude/skills/demo/scripts/run.sh")).unwrap(),
        "echo team\n"
    );
    update(&root, "demo", &skill).unwrap();
    assert_eq!(
        fs::read_to_string(root.join(".claude/skills/demo/scripts/run.sh")).unwrap(),
        "echo new\n"
    );
}
