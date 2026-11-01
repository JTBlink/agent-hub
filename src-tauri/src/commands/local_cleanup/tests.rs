use super::*;
use crate::core::{content_hash, skill_store::DiscoveredSkillRecord};
fn adapter(root: &Path, key: &str) -> ToolAdapter {
    let mut adapter = tool_adapters::default_tool_adapters().remove(0);
    adapter.key = key.into();
    adapter.relative_skills_dir = root.to_string_lossy().into_owned();
    adapter
}
fn discovered(store: &SkillStore, root: &Path, key: &str) -> String {
    let path = root.join("demo");
    std::fs::create_dir_all(&path).unwrap();
    std::fs::write(path.join("SKILL.md"), "# Demo").unwrap();
    let id = format!("location-{key}");
    store
        .insert_discovered(&DiscoveredSkillRecord {
            id: id.clone(),
            tool: key.into(),
            found_path: path.to_string_lossy().into_owned(),
            name_guess: Some("demo".into()),
            fingerprint: Some(content_hash::hash_directory(&path).unwrap()),
            found_at: 0,
            imported_skill_id: None,
        })
        .unwrap();
    id
}
#[test]
fn shared_installed_manual_and_library_roots_are_preserved() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().join("skills");
    std::fs::create_dir_all(&root).unwrap();
    let a = adapter(&root, "one");
    let b = adapter(&root, "two");
    assert!(roots(
        &[a.clone(), b.clone()],
        &HashSet::from(["two".into()]),
        &tmp.path().join("library"),
        false,
    )
    .is_empty());
    let mut manual = b;
    manual.override_skills_dir = Some(root.to_string_lossy().into_owned());
    assert!(roots(
        &[a.clone(), manual],
        &HashSet::new(),
        &tmp.path().join("library"),
        false,
    )
    .is_empty());
    assert!(roots(&[a], &HashSet::new(), &root, false).is_empty());
}

#[test]
fn installed_agent_roots_are_candidates_when_requested() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().join("installed/skills");
    std::fs::create_dir_all(root.join("demo")).unwrap();
    let adapter = adapter(&root, "installed");
    let candidates = roots(
        &[adapter],
        &HashSet::from(["installed".into()]),
        &tmp.path().join("library"),
        true,
    );
    assert_eq!(candidates.get("installed"), Some(&root));
}
#[test]
fn installed_after_preview_is_skipped_and_changed_contents_are_preserved() {
    let _guard = central_repo::test_base_dir_lock();
    let tmp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(tmp.path().join("library")));
    let store = SkillStore::new(&tmp.path().join("db")).unwrap();
    let root = tmp.path().join("agent/skills");
    let id = discovered(&store, &root, "fixture");
    let adapters = [adapter(&root, "fixture")];
    assert_eq!(
        plan(&store, &adapters, &HashSet::new(), false)
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        execute(
            &store,
            std::slice::from_ref(&id),
            &adapters,
            &HashSet::from(["fixture".into()]),
            false,
        )
        .unwrap()
        .removed,
        0
    );
    std::fs::write(root.join("demo/SKILL.md"), "# Changed").unwrap();
    let result = execute(&store, &[id], &adapters, &HashSet::new(), false).unwrap();
    assert_eq!(result.removed, 0);
    assert_eq!(result.failures.len(), 1);
    assert!(root.join("demo").exists());
    central_repo::set_test_base_dir_override(None);
}
#[test]
fn duplicate_locations_delete_once_prune_empty_skills_and_keep_config() {
    let _guard = central_repo::test_base_dir_lock();
    let tmp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(tmp.path().join("library")));
    let store = SkillStore::new(&tmp.path().join("db")).unwrap();
    let root = tmp.path().join("agent/skills");
    let id = discovered(&store, &root, "fixture");
    let adapters = [adapter(&root, "fixture")];
    std::fs::write(root.parent().unwrap().join("config.json"), "keep").unwrap();
    let result = execute(&store, &[id.clone(), id], &adapters, &HashSet::new(), false).unwrap();
    assert_eq!(result.removed, 1);
    assert!(result.failures.is_empty());
    assert!(!root.exists());
    assert!(root.parent().unwrap().join("config.json").is_file());
    central_repo::set_test_base_dir_override(None);
}
#[test]
fn empty_directories_are_candidates_but_links_and_unknown_files_are_not_empty() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().join("skills");
    std::fs::create_dir_all(root.join("nested")).unwrap();
    assert!(empty_tree(&root));
    std::fs::write(root.join("keep"), "keep").unwrap();
    assert!(!empty_tree(&root));
    prune_empty(&root);
    assert!(root.join("keep").is_file());
    assert!(!root.join("nested").exists());
}
#[cfg(unix)]
#[test]
fn shared_library_alias_is_unlinked_but_linked_primary_root_is_not_cleaned() {
    let _guard = central_repo::test_base_dir_lock();
    let tmp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(tmp.path().join("library")));
    let store = SkillStore::new(&tmp.path().join("db")).unwrap();
    let root = tmp.path().join("agent/skills");
    let target = central_repo::skills_dir().join("demo");
    std::fs::create_dir_all(&root).unwrap();
    std::fs::create_dir_all(&target).unwrap();
    std::fs::write(target.join("SKILL.md"), "# Demo").unwrap();
    let link = root.join("demo");
    std::os::unix::fs::symlink(&target, &link).unwrap();
    store
        .insert_discovered(&DiscoveredSkillRecord {
            id: "link".into(),
            tool: "fixture".into(),
            found_path: link.to_string_lossy().into_owned(),
            name_guess: None,
            fingerprint: Some(content_hash::hash_directory(&link).unwrap()),
            found_at: 0,
            imported_skill_id: None,
        })
        .unwrap();
    let result = execute(
        &store,
        &["link".into()],
        &[adapter(&root, "fixture")],
        &HashSet::new(),
        false,
    )
    .unwrap();
    assert_eq!(result.removed, 1);
    assert!(target.join("SKILL.md").exists());
    assert!(!link.exists());
    std::fs::create_dir_all(root.parent().unwrap()).unwrap();
    std::os::unix::fs::symlink(&target, &root).unwrap();
    assert!(roots(
        &[adapter(&root, "fixture")],
        &HashSet::new(),
        &tmp.path().join("library"),
        false,
    )
    .is_empty());
    central_repo::set_test_base_dir_override(None);
}

#[test]
fn shared_uninstalled_path_can_be_selected_by_either_agent_and_is_deleted_once() {
    let _guard = central_repo::test_base_dir_lock();
    let tmp = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(tmp.path().join("library")));
    let store = SkillStore::new(&tmp.path().join("db")).unwrap();
    let root = tmp.path().join("agent/skills");
    let a = discovered(&store, &root, "one");
    let b = discovered(&store, &root, "two");
    let adapters = [adapter(&root, "one"), adapter(&root, "two")];
    let preview = plan(&store, &adapters, &HashSet::new(), false).unwrap();
    assert_eq!(preview.len(), 2);
    assert!(preview.iter().any(|entry| entry.tool == "two"));
    let result = execute(&store, &[b, a], &adapters, &HashSet::new(), false).unwrap();
    assert_eq!(result.removed, 1);
    assert!(result.failures.is_empty());
    assert!(!root.exists());
    central_repo::set_test_base_dir_override(None);
}
