use std::fs;

use agent_hub_lib::skills::{
    preset_git_sources, resolve_legacy_codex_skill, scan_installed_skills, GitLocator,
    GitSourceAdapter, LegacyCodexSkillAction, LocalSourceAdapter, MarketplaceSourceAdapter,
    SkillSourceAdapter, SkillsShSourceAdapter, SourceError, SourceKind,
};
use tempfile::tempdir;

fn write_skill(root: &std::path::Path, name: &str) {
    let directory = root.join(name);
    fs::create_dir_all(&directory).expect("skill directory created");
    fs::write(
        directory.join("SKILL.md"),
        format!("---\nname: {name}\ndescription: Test {name}\n---\nDo not execute me.\n"),
    )
    .expect("skill written");
}

#[test]
fn local_adapter_exposes_valid_skills_through_the_public_seam() {
    let directory = tempdir().expect("temporary source");
    write_skill(directory.path(), "review");

    let adapter: Box<dyn SkillSourceAdapter> = Box::new(LocalSourceAdapter::new(directory.path()));
    let scan = adapter.scan().expect("source scans");

    assert_eq!(adapter.metadata().kind, SourceKind::Local);
    assert_eq!(scan.skills.len(), 1);
    assert_eq!(scan.skills[0].name.as_deref(), Some("review"));
    assert!(scan.skills[0].installable);
}

#[test]
fn marketplace_keeps_remote_entries_visible_and_scans_local_entries() {
    let directory = tempdir().expect("temporary marketplace");
    write_skill(&directory.path().join("plugins"), "review");
    fs::create_dir_all(directory.path().join(".claude-plugin"))
        .expect("manifest directory created");
    let manifest = directory.path().join(".claude-plugin/marketplace.json");
    fs::write(
        &manifest,
        r#"{"name":"test","plugins":[{"name":"local","source":"plugins/review"},{"name":"remote","source":{"source":"github","repo":"example/repo"}}]}"#,
    )
    .expect("manifest written");

    let scan = MarketplaceSourceAdapter::new(manifest)
        .scan()
        .expect("manifest scans");

    assert_eq!(scan.catalog_entries.len(), 2);
    assert!(scan.catalog_entries[0].installable);
    assert!(!scan.catalog_entries[1].installable);
    assert_eq!(scan.skills.len(), 1);
}

#[test]
fn remote_sources_require_a_caller_provided_checkout() {
    let locator = GitLocator::new("https://github.com/example/skills.git", None, None)
        .expect("valid locator");
    assert!(matches!(
        GitSourceAdapter::new(locator).scan(),
        Err(SourceError::CheckoutRequired)
    ));
    assert!(matches!(
        SkillsShSourceAdapter::new("anthropics/skills")
            .expect("valid skills.sh source")
            .scan(),
        Err(SourceError::CheckoutRequired)
    ));
    assert_eq!(preset_git_sources().len(), 4);
    assert!(preset_git_sources()
        .iter()
        .all(|source| source.metadata().kind == SourceKind::PresetGit));
}

#[test]
fn inventory_reports_scope_path_external_management_and_duplicates_without_mutation() {
    let home = tempdir().expect("home");
    let workspace = tempdir().expect("workspace");
    write_skill(&home.path().join(".claude/skills"), "review");
    write_skill(&home.path().join(".agents/skills"), "review");
    fs::create_dir_all(home.path().join(".codex/skills/review")).expect("legacy root");
    fs::write(
        home.path().join(".codex/skills/review/SKILL.md"),
        "---\nname: review\ndescription: legacy\n---\n",
    )
    .expect("legacy Skill");
    let before = fs::read_dir(home.path()).expect("home lists").count();
    let inventory = scan_installed_skills(home.path(), Some(workspace.path()));
    let after = fs::read_dir(home.path()).expect("home lists").count();
    assert_eq!(before, after);
    assert!(inventory.skills.iter().any(|skill| {
        skill.agent == agent_hub_lib::Agent::ClaudeCode
            && skill.scope == agent_hub_lib::Scope::Global
            && skill.path.ends_with(".claude/skills/review/SKILL.md")
            && !skill.source_tracked
    }));
    assert!(inventory
        .duplicate_names
        .iter()
        .any(|name| name == "review"));
    assert_eq!(inventory.roots.len(), 3);
    assert!(inventory.roots.iter().all(|root| root.bytes > 0));
    assert!(inventory
        .roots
        .iter()
        .any(|root| root.path.ends_with(".agents/skills") && root.skill_count == 1));
}

#[test]
fn codex_system_skills_are_visible_but_not_flagged_for_legacy_migration() {
    let home = tempdir().expect("home");
    write_skill(&home.path().join(".codex/skills/.system"), "plugin-creator");

    let inventory = scan_installed_skills(home.path(), None::<&std::path::Path>);

    assert!(inventory.skills.iter().any(|skill| skill
        .path
        .ends_with(".codex/skills/.system/plugin-creator/SKILL.md")));
    assert!(!inventory
        .diagnostics
        .iter()
        .any(|item| item.code == "codex-legacy-location"));
}

#[test]
fn legacy_codex_skill_is_migrated_to_the_preferred_global_root() {
    let home = tempdir().expect("home");
    let backups = tempdir().expect("backups");
    let legacy_root = home.path().join(".codex/skills");
    write_skill(&legacy_root, "review");

    let inventory = scan_installed_skills(home.path(), None::<&std::path::Path>);
    assert!(inventory.duplicate_names.is_empty());
    assert!(inventory
        .diagnostics
        .iter()
        .any(|item| item.code == "codex-legacy-location"));

    let source = legacy_root.join("review/SKILL.md");
    let result = resolve_legacy_codex_skill(
        home.path(),
        backups.path(),
        &source,
        LegacyCodexSkillAction::Migrate,
    )
    .expect("legacy Skill migrates");

    assert_eq!(
        result.destination_path,
        home.path().join(".agents/skills/review")
    );
    assert!(!legacy_root.join("review").exists());
    assert!(home.path().join(".agents/skills/review/SKILL.md").is_file());
    assert!(result.backup_path.join("SKILL.md").is_file());
}

#[test]
fn codex_system_skill_is_not_migrated_as_a_user_skill() {
    let home = tempdir().expect("home");
    let backups = tempdir().expect("backups");
    let legacy_root = home.path().join(".codex/skills");
    write_skill(&legacy_root.join(".system"), "imagegen");

    let error = resolve_legacy_codex_skill(
        home.path(),
        backups.path(),
        legacy_root.join(".system/imagegen/SKILL.md"),
        LegacyCodexSkillAction::Migrate,
    )
    .expect_err("system Skill must stay managed by Codex");

    assert!(matches!(
        error,
        agent_hub_lib::skills::LegacyCodexSkillError::SystemSkill
    ));
    assert!(legacy_root.join(".system/imagegen/SKILL.md").is_file());
    assert!(!home.path().join(".agents/skills/.system/imagegen").exists());
}

#[test]
fn redundant_codex_legacy_copy_is_archived_instead_of_deleted() {
    let home = tempdir().expect("home");
    let backups = tempdir().expect("backups");
    write_skill(&home.path().join(".agents/skills"), "review");
    write_skill(&home.path().join(".codex/skills"), "review");

    let result = resolve_legacy_codex_skill(
        home.path(),
        backups.path(),
        home.path().join(".codex/skills/review/SKILL.md"),
        LegacyCodexSkillAction::Archive,
    )
    .expect("legacy copy archives");

    assert!(!home.path().join(".codex/skills/review").exists());
    assert!(result.destination_path.join("SKILL.md").is_file());
    assert_eq!(result.backup_path, result.destination_path);
    assert!(home.path().join(".agents/skills/review/SKILL.md").is_file());
}
