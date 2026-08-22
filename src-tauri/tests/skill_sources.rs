use std::fs;

use agent_hub_lib::skills::{
    preset_git_sources, GitLocator, GitSourceAdapter, LocalSourceAdapter, MarketplaceSourceAdapter,
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
