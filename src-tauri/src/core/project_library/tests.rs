use super::*;
use crate::core::{content_hash, skill_store::SkillStore, tool_adapters};
use std::fs;
use tempfile::tempdir;

fn fixture(root: &Path) -> SkillRecord {
    let source = root.join("personal/demo");
    fs::create_dir_all(source.join("scripts")).unwrap();
    fs::write(
        source.join("SKILL.md"),
        "---\nname: demo\n---\n# Team skill\n",
    )
    .unwrap();
    fs::write(source.join("scripts/run.sh"), "echo team\n").unwrap();
    let store = SkillStore::new(&root.join("fixture.db")).unwrap();
    store
        .insert_skill(&SkillRecord {
            id: "demo-id".into(),
            name: "demo".into(),
            description: None,
            source_type: "local".into(),
            source_ref: Some(source.to_string_lossy().into()),
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            source_agent: None,
            remote_revision: None,
            central_path: source.to_string_lossy().into(),
            content_hash: Some(content_hash::hash_directory(&source).unwrap()),
            enabled: true,
            created_at: 0,
            updated_at: 0,
            status: "ok".into(),
            update_status: "local_only".into(),
            last_checked_at: None,
            last_check_error: None,
        })
        .unwrap();
    store.get_skill_by_id("demo-id").unwrap().unwrap()
}

#[test]
fn target_paths_keeps_each_agent_when_project_directories_are_shared() {
    let root = tempdir().unwrap();
    let claude = tool_adapters::find_adapter("claude_code").unwrap();
    let codex = tool_adapters::find_adapter("codex").unwrap();
    let mut shared = codex.clone();
    shared.key = "shared_agent".into();
    let paths = target_paths(root.path(), "demo", &[claude, codex, shared]).unwrap();

    assert_eq!(paths.len(), 3);
    assert_eq!(paths["claude_code"], ".claude/skills/demo");
    assert_eq!(paths["codex"], ".codex/skills/demo");
    assert_eq!(paths["shared_agent"], ".codex/skills/demo");
}

#[test]
fn target_paths_rejects_nested_agent_directories() {
    let root = tempdir().unwrap();
    let claude = tool_adapters::find_adapter("claude_code").unwrap();
    let mut codex = tool_adapters::find_adapter("codex").unwrap();
    codex.project_relative_skills_dir = Some(".claude/skills/demo/scripts".into());

    assert!(target_paths(root.path(), "demo", &[claude, codex]).is_err());
}

#[test]
fn team_project_survives_removing_the_personal_library() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let project = tmp.path().join("project");
    fs::create_dir(&project).unwrap();
    let targets = [
        tool_adapters::find_adapter("claude_code").unwrap(),
        tool_adapters::find_adapter("codex").unwrap(),
    ];
    install(&project, &skill, &targets).unwrap();
    fs::remove_dir_all(tmp.path().join("personal")).unwrap();
    for directory in [".agents/skills", ".claude/skills", ".codex/skills"] {
        let entry = project.join(directory).join("demo");
        assert!(!entry.is_symlink());
        assert_eq!(
            fs::read_to_string(entry.join("scripts/run.sh")).unwrap(),
            "echo team\n"
        );
    }
    let manifest = fs::read_to_string(project.join(".agent-hub/project-skills.json")).unwrap();
    assert!(!manifest.contains(&tmp.path().to_string_lossy().to_string()));
}

struct TestProject {
    directory: tempfile::TempDir,
    _guard: std::sync::MutexGuard<'static, ()>,
}
impl TestProject {
    fn new() -> Self {
        let guard = crate::core::central_repo::test_base_dir_lock();
        let directory = tempdir().unwrap();
        crate::core::central_repo::set_test_base_dir_override(Some(directory.path().join("state")));
        Self {
            directory,
            _guard: guard,
        }
    }
    fn path(&self) -> &Path {
        self.directory.path()
    }
}
impl Drop for TestProject {
    fn drop(&mut self) {
        crate::core::central_repo::set_test_base_dir_override(None);
    }
}

#[test]
fn update_refreshes_every_team_copy_but_preserves_project_edits() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir(&root).unwrap();
    let targets = [
        tool_adapters::find_adapter("claude_code").unwrap(),
        tool_adapters::find_adapter("codex").unwrap(),
    ];
    install(&root, &skill, &targets).unwrap();
    fs::write(
        Path::new(&skill.central_path).join("scripts/run.sh"),
        "echo updated\n",
    )
    .unwrap();
    update(&root, "demo", &skill).unwrap();
    assert_eq!(
        fs::read_to_string(root.join(".claude/skills/demo/scripts/run.sh")).unwrap(),
        "echo updated\n"
    );
    fs::write(root.join(".codex/skills/demo/mine.txt"), "local result").unwrap();
    fs::write(
        Path::new(&skill.central_path).join("scripts/run.sh"),
        "echo later\n",
    )
    .unwrap();
    assert!(update(&root, "demo", &skill).is_err());
    assert_eq!(
        fs::read_to_string(root.join(".agents/skills/demo/scripts/run.sh")).unwrap(),
        "echo updated\n"
    );
    assert_eq!(
        fs::read_to_string(root.join(".codex/skills/demo/mine.txt")).unwrap(),
        "local result"
    );
}

#[test]
fn repair_uses_only_project_content_and_keeps_modified_copies() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir(&root).unwrap();
    let target = tool_adapters::find_adapter("claude_code").unwrap();
    install(&root, &skill, &[target]).unwrap();
    fs::remove_dir_all(tmp.path().join("personal")).unwrap();
    fs::remove_dir_all(root.join(".claude/skills/demo")).unwrap();
    repair(&root, "demo").unwrap();
    assert!(root.join(".claude/skills/demo/SKILL.md").is_file());
    fs::write(
        root.join(".agents/skills/demo/scripts/run.sh"),
        "echo project\n",
    )
    .unwrap();
    repair(&root, "demo").unwrap();
    assert_eq!(
        fs::read_to_string(root.join(".claude/skills/demo/scripts/run.sh")).unwrap(),
        "echo project\n"
    );
    fs::write(root.join(".claude/skills/demo/.gitignore"), "local\n").unwrap();
    assert!(repair(&root, "demo").is_err());
    assert_eq!(
        fs::read_to_string(root.join(".claude/skills/demo/.gitignore")).unwrap(),
        "local\n"
    );
}

#[test]
fn adding_another_agent_keeps_the_team_version_and_shared_toggle_keeps_content() {
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
    fs::write(
        Path::new(&skill.central_path).join("SKILL.md"),
        "# Personal update\n",
    )
    .unwrap();
    install(
        &root,
        &skill,
        &[tool_adapters::find_adapter("codex").unwrap()],
    )
    .unwrap();
    assert!(fs::read_to_string(root.join(".codex/skills/demo/SKILL.md"))
        .unwrap()
        .contains("Team skill"));
    set_enabled(&root, "demo", false).unwrap();
    for directory in [".agents/skills", ".claude/skills", ".codex/skills"] {
        assert!(!root.join(directory).join("demo").exists());
        assert!(root
            .join(format!("{directory}-disabled/demo/SKILL.md"))
            .is_file());
    }
    set_enabled(&root, "demo", true).unwrap();
    assert!(root.join(".agents/skills/demo/SKILL.md").is_file());
    remove_target(&root, "demo", "claude_code").unwrap();
    assert!(!root.join(".claude/skills/demo").exists());
    assert!(root.join(".agents/skills/demo/SKILL.md").is_file());
    assert!(root.join(".codex/skills/demo/SKILL.md").is_file());
}

#[test]
fn corrupted_manifest_and_foreign_target_fail_without_writing_other_targets() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir_all(root.join(".codex/skills/demo")).unwrap();
    fs::write(root.join(".codex/skills/demo/mine.txt"), "precious").unwrap();
    let targets = [
        tool_adapters::find_adapter("claude_code").unwrap(),
        tool_adapters::find_adapter("codex").unwrap(),
    ];
    assert!(install(&root, &skill, &targets).is_err());
    assert!(!root.join(".agents/skills/demo").exists());
    assert!(!root.join(".claude/skills/demo").exists());
    assert_eq!(
        fs::read_to_string(root.join(".codex/skills/demo/mine.txt")).unwrap(),
        "precious"
    );
    fs::create_dir_all(root.join(".agent-hub")).unwrap();
    fs::write(root.join(manifest::MANIFEST), "{ conflict").unwrap();
    assert!(install(&root, &skill, &targets[..1]).is_err());
    assert_eq!(
        fs::read_to_string(root.join(manifest::MANIFEST)).unwrap(),
        "{ conflict"
    );
}

#[test]
fn cloned_team_files_can_be_used_and_repaired_without_personal_state() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir(&root).unwrap();
    let repo = git2::Repository::init(&root).unwrap();
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
        "Team skills",
        &tree,
        &[],
    )
    .unwrap();
    let cloned = tmp.path().join("new-member");
    git2::Repository::clone(root.to_str().unwrap(), &cloned).unwrap();
    fs::remove_dir_all(tmp.path().join("personal")).unwrap();
    assert!(cloned.join(".claude/skills/demo/SKILL.md").is_file());
    assert!(status(&cloned).unwrap().skills[0].stale_targets.is_empty());
    fs::remove_dir_all(cloned.join(".claude/skills/demo")).unwrap();
    repair(&cloned, "demo").unwrap();
    assert!(cloned.join(".claude/skills/demo/SKILL.md").is_file());
}

#[cfg(unix)]
#[test]
fn project_link_escape_is_refused_without_touching_external_content() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    let outside = tmp.path().join("outside");
    fs::create_dir_all(&root).unwrap();
    fs::create_dir(&outside).unwrap();
    fs::write(outside.join("keep.txt"), "outside").unwrap();
    std::os::unix::fs::symlink(&outside, root.join(".agents")).unwrap();
    assert!(install(
        &root,
        &skill,
        &[tool_adapters::find_adapter("claude_code").unwrap()]
    )
    .is_err());
    assert_eq!(
        fs::read_to_string(outside.join("keep.txt")).unwrap(),
        "outside"
    );
}

#[test]
fn failed_publication_restores_every_previous_team_file_and_manifest() {
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
    let old_manifest = fs::read(root.join(manifest::MANIFEST)).unwrap();
    fs::write(
        Path::new(&skill.central_path).join("SKILL.md"),
        "# Updated\n",
    )
    .unwrap();
    transaction::FAIL_AFTER.with(|value| value.set(Some(1)));
    let result = update(&root, "demo", &skill);
    transaction::FAIL_AFTER.with(|value| value.set(None));
    assert!(result.is_err());
    assert_eq!(
        fs::read(root.join(manifest::MANIFEST)).unwrap(),
        old_manifest
    );
    for path in [
        ".agents/skills/demo/SKILL.md",
        ".claude/skills/demo/SKILL.md",
    ] {
        assert!(fs::read_to_string(root.join(path))
            .unwrap()
            .contains("Team skill"));
    }
    update(&root, "demo", &skill).unwrap();
    assert_eq!(
        fs::read_to_string(root.join(".agents/skills/demo/SKILL.md")).unwrap(),
        "# Updated\n"
    );
}

#[test]
fn dedicated_target_toggle_preserves_other_team_targets() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir(&root).unwrap();
    install(
        &root,
        &skill,
        &[
            tool_adapters::find_adapter("claude_code").unwrap(),
            tool_adapters::find_adapter("codex").unwrap(),
        ],
    )
    .unwrap();
    set_target_enabled(&root, "demo", "claude_code", false).unwrap();
    assert!(root.join(".claude/skills-disabled/demo/SKILL.md").is_file());
    assert!(root.join(".codex/skills/demo/SKILL.md").is_file());
    assert!(root.join(".agents/skills/demo/SKILL.md").is_file());
    assert!(status(&root).unwrap().skills[0].stale_targets.is_empty());
    set_target_enabled(&root, "demo", "claude_code", true).unwrap();
    assert!(root.join(".claude/skills/demo/SKILL.md").is_file());
}

#[test]
fn nested_custom_target_is_refused_before_any_project_content_is_written() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir(&root).unwrap();
    let mut target = tool_adapters::find_adapter("claude_code").unwrap();
    target.project_relative_skills_dir = Some(".agents/skills/demo/scripts".into());
    assert!(install(&root, &skill, &[target]).is_err());
    assert!(!root.join(".agents/skills/demo").exists());
}

#[test]
fn git_ignore_warnings_include_resources_inside_the_team_skill() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir(&root).unwrap();
    git2::Repository::init(&root).unwrap();
    fs::write(root.join(".gitignore"), "*.sh\n").unwrap();
    let report = install(
        &root,
        &skill,
        &[tool_adapters::find_adapter("claude_code").unwrap()],
    )
    .unwrap();
    assert!(report
        .ignored_paths
        .iter()
        .any(|p| p.replace('\\', "/") == ".agents/skills/demo/scripts/run.sh"));
    assert!(report
        .ignored_paths
        .iter()
        .any(|p| p.replace('\\', "/") == ".claude/skills/demo/scripts/run.sh"));
}

#[test]
fn text_line_ending_conversion_does_not_mark_a_clean_team_copy_modified() {
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
    for directory in [".agents/skills", ".claude/skills"] {
        for file in ["SKILL.md", "scripts/run.sh"] {
            let path = root.join(directory).join("demo").join(file);
            let text = fs::read_to_string(&path).unwrap();
            fs::write(path, text.replace('\n', "\r\n")).unwrap();
        }
    }
    let report = status(&root).unwrap();
    assert!(!report.skills[0].modified);
    assert!(report.skills[0].stale_targets.is_empty());
    repair(&root, "demo").unwrap();
}

#[test]
fn redeploy_keeps_disabled_entry_and_shared_toggle_handles_mixed_states() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    let root = tmp.path().join("project");
    fs::create_dir(&root).unwrap();
    let claude = tool_adapters::find_adapter("claude_code").unwrap();
    install(
        &root,
        &skill,
        &[
            claude.clone(),
            tool_adapters::find_adapter("codex").unwrap(),
        ],
    )
    .unwrap();
    set_target_enabled(&root, "demo", "claude_code", false).unwrap();
    deploy(&root, "demo", &[claude]).unwrap();
    assert!(!root.join(".claude/skills/demo").exists());
    assert!(root.join(".claude/skills-disabled/demo/SKILL.md").is_file());
    set_enabled(&root, "demo", false).unwrap();
    assert!(root.join(".agents/skills-disabled/demo/SKILL.md").is_file());
    set_enabled(&root, "demo", true).unwrap();
    assert!(root.join(".claude/skills/demo/SKILL.md").is_file());
    assert!(root.join(".codex/skills/demo/SKILL.md").is_file());
}

#[test]
fn clone_without_git_ignored_empty_directories_is_still_the_same_team_version() {
    let tmp = TestProject::new();
    let skill = fixture(tmp.path());
    fs::create_dir_all(Path::new(&skill.central_path).join("scripts/cache")).unwrap();
    let root = tmp.path().join("project");
    fs::create_dir(&root).unwrap();
    install(
        &root,
        &skill,
        &[tool_adapters::find_adapter("claude_code").unwrap()],
    )
    .unwrap();
    fs::remove_dir(root.join(".agents/skills/demo/scripts/cache")).unwrap();
    fs::remove_dir(root.join(".claude/skills/demo/scripts/cache")).unwrap();
    assert!(!status(&root).unwrap().skills[0].modified);
    update(&root, "demo", &skill).unwrap();
}

#[test]
fn removing_last_team_skill_retains_manifest_in_commit_report() {
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
    let report = remove(&root, "demo").unwrap();
    assert!(report.skills.is_empty());
    assert!(report.files_to_commit.contains(&manifest::MANIFEST.into()));
    assert!(!root.join(".agents/skills/demo").exists());
    assert!(!root.join(".claude/skills/demo").exists());
}
