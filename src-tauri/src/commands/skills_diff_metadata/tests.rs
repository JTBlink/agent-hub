use super::*;

#[test]
fn compares_declared_versions_without_guessing_from_content_changes() {
    assert_eq!(
        compare_versions(Some("1.10.0"), Some("1.9.0")),
        "central_newer"
    );
    assert_eq!(
        compare_versions(Some("v1.0.0-rc.1"), Some("1.0.0")),
        "source_newer"
    );
    assert_eq!(
        compare_versions(Some("1.0.0+a"), Some("1.0.0+b")),
        "same_version"
    );
    assert_eq!(compare_versions(None, Some("1.0.0")), "unknown");
    assert_eq!(
        compare_versions(Some("workspace"), Some("1.0.0")),
        "unknown"
    );
}

#[test]
fn describes_actual_versions_and_persistent_source_location() {
    let temp = tempfile::tempdir().unwrap();
    let central = temp.path().join("library/demo");
    let source = temp.path().join("checkout/demo");
    std::fs::create_dir_all(&central).unwrap();
    std::fs::create_dir_all(&source).unwrap();
    std::fs::write(central.join("SKILL.md"), "---\nversion: 1.0.0\n---\n").unwrap();
    std::fs::write(
        source.join("SKILL.md"),
        "---\nmetadata:\n  version: 1.1.0\n---\n",
    )
    .unwrap();
    let dto = SkillSourceDiffDto::from_directories(
        "demo".into(),
        "git".into(),
        "revision".into(),
        &central,
        &source,
        "https://example.invalid/repo :: skills/demo".into(),
        vec![],
    );
    assert_eq!(dto.central_path, central.to_string_lossy());
    assert_eq!(
        dto.source_path,
        "https://example.invalid/repo :: skills/demo"
    );
    assert_eq!(dto.source_version.as_deref(), Some("1.1.0"));
    assert_eq!(dto.version_comparison, "source_newer");
}
