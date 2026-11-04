use super::*;

#[test]
fn copies_multiple_files_and_nested_directories_without_changing_sources() {
    let workspace = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    fs::create_dir(source.path().join("notes")).unwrap();
    fs::write(source.path().join("notes/你好.md"), "hello").unwrap();
    fs::write(source.path().join("image.bin"), [0, 255, 1]).unwrap();
    fs::create_dir(workspace.path().join("dist")).unwrap();
    let copied = copy_into(
        workspace.path(),
        "dist",
        &[source.path().join("notes"), source.path().join("image.bin")],
    )
    .unwrap();
    assert_eq!(copied, ["dist/notes", "dist/image.bin"]);
    assert_eq!(
        fs::read(workspace.path().join("dist/image.bin")).unwrap(),
        [0, 255, 1]
    );
    assert_eq!(
        fs::read_to_string(workspace.path().join("dist/notes/你好.md")).unwrap(),
        "hello"
    );
    assert!(source.path().join("notes/你好.md").is_file());
    assert_eq!(
        fs::read_dir(workspace.path().join("dist")).unwrap().count(),
        2
    );
}

#[test]
fn collisions_and_invalid_sources_leave_the_batch_unpublished() {
    let workspace = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    fs::write(source.path().join("first"), "first").unwrap();
    fs::write(source.path().join("existing"), "new").unwrap();
    fs::write(workspace.path().join("existing"), "original").unwrap();
    assert!(copy_into(
        workspace.path(),
        "",
        &[source.path().join("first"), source.path().join("existing")]
    )
    .is_err());
    assert!(!workspace.path().join("first").exists());
    assert_eq!(
        fs::read_to_string(workspace.path().join("existing")).unwrap(),
        "original"
    );
    fs::create_dir(source.path().join("repo")).unwrap();
    fs::write(source.path().join("repo/.git"), "gitdir: elsewhere").unwrap();
    assert!(copy_into(
        workspace.path(),
        "",
        &[source.path().join("first"), source.path().join("repo")]
    )
    .is_err());
    assert_eq!(fs::read_dir(workspace.path()).unwrap().count(), 1);
}

#[test]
fn rejects_empty_clipboard_traversal_and_recursive_copy() {
    let root = tempfile::tempdir().unwrap();
    assert!(copy_into(root.path(), "", &[]).is_err());
    assert!(copy_into(root.path(), "../", &[root.path().to_owned()]).is_err());
    assert!(copy_into(root.path(), "", &[root.path().to_owned()]).is_err());
}

#[cfg(unix)]
#[test]
fn refuses_linked_destinations_and_nested_source_links() {
    let root = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    std::os::unix::fs::symlink(source.path(), root.path().join("link")).unwrap();
    assert!(copy_into(root.path(), "link", &[source.path().to_owned()]).is_err());
    fs::create_dir(source.path().join("folder")).unwrap();
    std::os::unix::fs::symlink(root.path(), source.path().join("folder/link")).unwrap();
    assert!(copy_into(root.path(), "", &[source.path().join("folder")]).is_err());
    assert!(!root.path().join("folder").exists());
}
