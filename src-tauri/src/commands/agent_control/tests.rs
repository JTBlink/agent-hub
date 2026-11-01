use super::*;

#[test]
fn checks_the_real_skill_directory_and_its_version() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join(SKILL_NAME);
    let bundled = skill_metadata::parse_frontmatter(BUNDLED_SKILL)
        .version
        .map(|version| Version::parse(&version).unwrap())
        .unwrap();
    assert!(!inspect_location(&path, &bundled).present);

    std::fs::create_dir(&path).unwrap();
    std::fs::write(
        path.join("SKILL.md"),
        "---\nname: agent-hub-cli\nversion: 1.0.0\n---\n",
    )
    .unwrap();
    let installed = inspect_location(&path, &bundled);
    assert!(installed.present);
    assert!(installed.outdated);

    std::fs::write(
        path.join("SKILL.md"),
        format!("---\nname: agent-hub-cli\nversion: {bundled}\n---\n"),
    )
    .unwrap();
    assert!(!inspect_location(&path, &bundled).outdated);
    std::fs::write(path.join("SKILL.md"), "---\nname: other-skill\n---\n").unwrap();
    let occupied = inspect_location(&path, &bundled);
    assert!(occupied.occupied);
    assert!(!occupied.present);
    std::fs::remove_file(path.join("SKILL.md")).unwrap();
    assert!(!inspect_location(&path, &bundled).present);
}
