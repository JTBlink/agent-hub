use super::*;

#[test]
fn refuses_saving_over_a_document_changed_on_disk() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("guide.md");
    std::fs::write(&path, "original").unwrap();
    let documents = Documents::default();
    let opened = documents.open(&path).unwrap();
    std::fs::write(&path, "changed elsewhere").unwrap();
    assert!(documents
        .save(&opened.id, "draft", &opened.revision)
        .is_err());
    assert_eq!(std::fs::read_to_string(path).unwrap(), "changed elsewhere");
}

#[test]
fn resources_remain_scoped_to_the_selected_file_directory() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path().join("site");
    std::fs::create_dir(&root).unwrap();
    std::fs::write(root.join("index.html"), "<img src='image.svg'>").unwrap();
    std::fs::write(root.join("image.svg"), "<svg/>").unwrap();
    std::fs::write(directory.path().join("private.txt"), "private").unwrap();
    let documents = Documents::default();
    let opened = documents.open(&root.join("index.html")).unwrap();
    assert!(documents.resource(&opened.id, "image.svg").is_ok());
    assert!(documents.resource(&opened.id, "../private.txt").is_err());
    assert!(documents.resource(&opened.id, ".env").is_err());
    documents.close(&opened.id);
    assert!(documents.resource(&opened.id, "image.svg").is_err());
}

#[cfg(unix)]
#[test]
fn rejects_visible_symlinks_to_hidden_resources() {
    let root = tempfile::tempdir().unwrap();
    std::fs::write(root.path().join("index.html"), "page").unwrap();
    std::fs::write(root.path().join(".env"), "secret").unwrap();
    std::os::unix::fs::symlink(root.path().join(".env"), root.path().join("visible.txt")).unwrap();
    let documents = Documents::default();
    let opened = documents.open(&root.path().join("index.html")).unwrap();
    assert!(documents.resource(&opened.id, "visible.txt").is_err());
}

#[test]
fn resolves_encoded_file_names_query_and_fragments_without_escaping_the_grant() {
    let root = tempfile::tempdir().unwrap();
    let nested = root.path().join("literal%20folder");
    std::fs::create_dir(&nested).unwrap();
    std::fs::write(nested.join("guide.md"), "# Guide").unwrap();
    std::fs::write(nested.join("next #.md"), "# Next").unwrap();
    let documents = Documents::default();
    let opened = documents
        .open_at(root.path(), "literal%20folder/guide.md")
        .unwrap();
    let link = documents
        .resolve_link(&opened.id, "next%20%23.md?mode=read#next%20heading")
        .unwrap();
    assert_eq!(link.relative, "literal%20folder/next #.md");
    assert_eq!(link.suffix, "?mode=read#next%20heading");
    for href in [
        "file:///private.txt",
        "javascript:alert(1)",
        "https://example.invalid/a",
        "//example.invalid/a",
        ".env",
        "%2e%2e%2fsecret.md",
    ] {
        assert!(
            documents.resolve_link(&opened.id, href).is_err(),
            "accepted {href}"
        );
    }
}
