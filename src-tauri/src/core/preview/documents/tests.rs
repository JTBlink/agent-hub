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
