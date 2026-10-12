use super::{
    tests::{fixture, TestProject},
    *,
};
use crate::core::{
    deployment_preferences::{Preference, Scope, SETTING},
    skill_store::SkillStore,
    tool_adapters,
};

#[test]
fn absent_recorded_agent_is_unassigned_and_repair_does_not_readd_it() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir(&root).unwrap();
    install_with_mode(
        &root,
        &skill,
        &[tool_adapters::find_adapter("codex").unwrap()],
        true,
    )
    .unwrap();
    fs::remove_dir_all(root.join(".codex/skills/demo")).unwrap();
    let report = status(&root).unwrap();
    assert!(report.skills[0].target_issues.is_empty());
    assert!(report.skills[0].stale_targets.is_empty());
    repair(&root, "demo").unwrap();
    assert!(!root.join(".codex/skills/demo").exists());
    let removed = remove_target(&root, "demo", "codex").unwrap();
    assert!(removed.skills[0].targets.is_empty());
    assert!(removed.skills[0].stale_targets.is_empty());
    assert!(removed.skills[0].target_issues.is_empty());
    repair(&root, "demo").unwrap();
    assert!(!root.join(".codex/skills/demo").exists());
    assert!(root.join(".agents/skills/demo/SKILL.md").is_file());
}

#[cfg(unix)]
#[test]
fn default_copy_creates_new_copy_without_converting_existing_project_links() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir(&root).unwrap();
    let claude = tool_adapters::find_adapter("claude_code").unwrap();
    let codex = tool_adapters::find_adapter("codex").unwrap();
    let store = SkillStore::new(&tmp.path().join("settings.db")).unwrap();
    install(&root, &skill, std::slice::from_ref(&claude)).unwrap();
    store.set_setting(SETTING, "copy").unwrap();
    let copy = matches!(
        Preference::load(&store, Scope::Project)
            .unwrap()
            .for_install(None),
        super::super::sync_engine::SyncMode::Copy
    );
    install_with_mode(&root, &skill, &[claude, codex], copy).unwrap();
    assert!(root.join(".agents/skills/demo").is_dir());
    assert!(!root.join(".agents/skills/demo").is_symlink());
    assert!(root.join(".claude/skills/demo").is_symlink());
    assert!(!root.join(".codex/skills/demo").is_symlink());
    assert!(status(&root).unwrap().skills[0].target_issues.is_empty());
}

#[test]
fn absent_agents_stay_unassigned_during_refresh_and_explicit_deploy_adds_only_selected_agent() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir(&root).unwrap();
    let targets: Vec<_> = ["claude_code", "codex", "hermes", "opencode"]
        .iter()
        .map(|key| tool_adapters::find_adapter(key).unwrap())
        .collect();
    install_with_mode(&root, &skill, &targets, true).unwrap();
    for target in &targets {
        fs::remove_dir_all(root.join(target.project_relative_skills_dir()).join("demo")).unwrap();
    }
    let report = status(&root).unwrap();
    assert!(report.skills[0].target_issues.is_empty());
    assert!(report.skills[0].stale_targets.is_empty());
    assert!(!report.skills[0].modified);
    fs::write(
        root.join(".agents/skills/demo/project.txt"),
        "Project update",
    )
    .unwrap();
    let report = repair(&root, "demo").unwrap();
    assert!(!report.skills[0].modified);
    for target in &targets {
        assert!(!root
            .join(target.project_relative_skills_dir())
            .join("demo")
            .exists());
    }
    deploy(
        &root,
        "demo",
        &[tool_adapters::find_adapter("codex").unwrap()],
    )
    .unwrap();
    assert!(root.join(".codex/skills/demo/project.txt").is_file());
    for key in ["claude_code", "hermes", "opencode"] {
        let target = tool_adapters::find_adapter(key).unwrap();
        assert!(!root
            .join(target.project_relative_skills_dir())
            .join("demo")
            .exists());
    }
}

#[cfg(unix)]
#[test]
fn replaced_project_link_reports_its_cause_and_repair_restores_relative_link() {
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
    let target = root.join(".claude/skills/demo");
    fs::remove_file(&target).unwrap();
    transaction::copy_project_content(&root.join(".agents/skills/demo"), &target).unwrap();
    let report = status(&root).unwrap();
    assert_eq!(report.skills[0].target_issues[0].reason, "link_replaced");
    assert_eq!(report.skills[0].target_issues[0].agent, "claude_code");
    let report = repair(&root, "demo").unwrap();
    assert!(report.skills[0].target_issues.is_empty());
    assert_eq!(
        fs::read_link(&target).unwrap(),
        Path::new("../../.agents/skills/demo")
    );
    assert!(Path::new(&skill.central_path).join("SKILL.md").is_file());
}

#[test]
fn absent_entries_are_not_reported_but_changed_copies_keep_their_edits() {
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
    fs::remove_dir_all(root.join(".codex/skills/demo")).unwrap();
    fs::write(root.join(".claude/skills/demo/local.txt"), "Local edits").unwrap();
    let report = status(&root).unwrap();
    assert_eq!(
        report.skills[0]
            .target_issues
            .iter()
            .map(|issue| issue.reason)
            .collect::<Vec<_>>(),
        vec!["content_mismatch"]
    );
    assert!(repair(&root, "demo").is_err());
    assert!(!root.join(".codex/skills/demo").exists());
    assert_eq!(
        fs::read_to_string(root.join(".claude/skills/demo/local.txt")).unwrap(),
        "Local edits"
    );
}

#[cfg(unix)]
#[test]
fn wrong_external_link_is_reported_without_following_or_overwriting_its_source() {
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
    let target = root.join(".claude/skills/demo");
    fs::remove_file(&target).unwrap();
    std::os::unix::fs::symlink(&skill.central_path, &target).unwrap();
    assert_eq!(
        status(&root).unwrap().skills[0].target_issues[0].reason,
        "link_mismatch"
    );
    assert!(repair(&root, "demo").is_err());
    assert_eq!(
        target.canonicalize().unwrap(),
        Path::new(&skill.central_path).canonicalize().unwrap()
    );
}
