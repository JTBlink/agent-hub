use super::*;
use std::fs;
use tempfile::tempdir;

#[test]
fn catalog_keeps_repository_path_when_scan_root_is_nested() {
    let repo = tempdir().unwrap();
    let scan = repo.path().join("skills");
    let skill = scan.join("category/demo");
    fs::create_dir_all(&skill).unwrap();
    fs::write(
        skill.join("SKILL.md"),
        "---\nname: Demo\ndescription: Example\nmetadata:\n  version: '1.2.3'\n---\n",
    )
    .unwrap();
    let preview = preview_skill(repo.path(), &scan, &skill);
    assert_eq!(preview.rel_path, "category/demo");
    assert_eq!(preview.repo_path, "skills/category/demo");
    assert_eq!(preview.name, "Demo");
    assert_eq!(preview.description.as_deref(), Some("Example"));
    assert_eq!(preview.version.as_deref(), Some("1.2.3"));
}

#[test]
fn catalog_distinguishes_root_skill_from_nested_skills() {
    let repo = tempdir().unwrap();
    let preview = preview_skill(repo.path(), repo.path(), repo.path());
    assert_eq!(preview.repo_path, "");
    assert!(!preview.rel_path.is_empty());
}

#[test]
fn local_catalog_reads_uncommitted_skills_and_rejects_non_repositories() {
    let root = tempdir().unwrap();
    assert!(scan_local_repository(root.path()).is_err());
    git2::Repository::init(root.path()).unwrap();
    let skill = root.path().join("skills/demo");
    fs::create_dir_all(&skill).unwrap();
    fs::write(skill.join("SKILL.md"), "---\nname: Demo\n---\n").unwrap();
    let catalog = scan_local_repository(root.path()).unwrap();
    assert_eq!(catalog.skills.len(), 1);
    assert_eq!(catalog.skills[0].repo_path, "skills/demo");
    assert!(resolve_local_skill(root.path(), "skills/demo").is_ok());
    assert!(resolve_local_skill(root.path(), "../outside").is_err());
    assert!(scan_local_repository(&skill).is_err());
}

#[cfg(unix)]
#[test]
fn local_catalog_never_imports_symlinks_outside_the_repository() {
    let root = tempdir().unwrap();
    git2::Repository::init(root.path()).unwrap();
    let external = tempdir().unwrap();
    fs::write(
        external.path().join("SKILL.md"),
        "---\nname: External\n---\n",
    )
    .unwrap();
    std::os::unix::fs::symlink(external.path(), root.path().join("escape")).unwrap();
    assert!(scan_local_repository(root.path())
        .unwrap()
        .skills
        .is_empty());
    assert!(resolve_local_skill(root.path(), "escape").is_err());
}
