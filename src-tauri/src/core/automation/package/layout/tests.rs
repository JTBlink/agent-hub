use super::*;

fn create(state: &Path) -> PathBuf {
    let draft = serde_json::from_value(serde_json::json!({
        "name":"Layout example", "provider":"system", "content":"echo ready",
        "workdir":null, "schedule":{"kind":"manual"}, "enabled":false,
        "files":[{"path":"config/example.json","content":"{}"},
                 {"path":"prompts/prompt.md","content":"Review the selected request"},
                 {"path":"references/details.md","content":"# Details"}]
    }))
    .unwrap();
    let id = super::super::creation::stage(state, draft, vec![]).unwrap();
    super::super::directory(&super::super::find(state, &id).unwrap()).unwrap()
}

#[test]
fn new_packages_keep_instructions_at_root_and_json_in_config_with_root_relative_files() {
    let temp = tempfile::tempdir().unwrap();
    let path = create(temp.path());
    assert!(path.join("TASK.md").is_file());
    assert!(path.join("config/task.json").is_file());
    assert!(!path.join("task.json").exists());
    for source in [&path, &path.join("config/task.json")] {
        let package = super::super::preview_package(source).unwrap();
        assert!(package
            .draft
            .files
            .iter()
            .any(|f| f.path == "config/example.json"));
        assert!(package
            .draft
            .files
            .iter()
            .any(|f| f.path == "references/details.md"));
        assert!(package
            .draft
            .files
            .iter()
            .any(|f| f.path == "prompts/prompt.md"));
    }
}

#[test]
fn relative_directory_and_manifest_arguments_resolve_from_the_callers_working_directory() {
    let cwd = std::env::current_dir().unwrap();
    let temp = tempfile::tempdir_in(&cwd).unwrap();
    let path = create(temp.path());
    let relative = path.strip_prefix(&cwd).unwrap();
    for source in [relative.to_path_buf(), relative.join("config/task.json")] {
        assert_eq!(
            super::super::preview_package(&source).unwrap().draft.name,
            "Layout example"
        );
    }
}

#[test]
fn legacy_manifest_is_read_and_updated_in_place_without_an_implicit_migration() {
    let temp = tempfile::tempdir().unwrap();
    let path = create(temp.path());
    std::fs::rename(path.join("config/task.json"), path.join("task.json")).unwrap();
    let mut manifest = read_manifest(&path).unwrap();
    manifest.draft.name = "Updated legacy task".into();
    write_manifest(&path, &manifest).unwrap();
    assert!(path.join("task.json").is_file());
    assert!(!path.join("config/task.json").exists());
    assert_eq!(
        super::super::preview_package(&path.join("task.json"))
            .unwrap()
            .draft
            .name,
        "Updated legacy task"
    );
}

#[test]
fn conflicting_manifests_and_declared_metadata_are_rejected() {
    let temp = tempfile::tempdir().unwrap();
    let path = create(temp.path());
    std::fs::copy(path.join("config/task.json"), path.join("task.json")).unwrap();
    assert!(read_manifest(&path).is_err());
    assert!(super::super::preview_package(&path).is_err());
    for reserved in [
        "config/task.json",
        "config/catalog.json",
        ".local/private.json",
    ] {
        assert!(super::super::exchange::validate_path(reserved).is_err());
    }
}

#[cfg(unix)]
#[test]
fn configuration_directory_links_are_rejected_before_reading_a_manifest() {
    let temp = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::os::unix::fs::symlink(outside.path(), temp.path().join("config")).unwrap();
    std::fs::write(outside.path().join("task.json"), "{}").unwrap();
    assert!(read_manifest(temp.path()).is_err());
}
