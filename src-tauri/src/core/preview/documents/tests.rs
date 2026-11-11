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

#[test]
fn opens_browser_resources_without_text_conversion_and_refuses_edits() {
    let root = tempfile::tempdir().unwrap();
    let documents = Documents::default();
    for extension in [
        "png", "svg", "pdf", "txt", "json", "xml", "mp3", "mp4", "webm",
    ] {
        let path = root.path().join(format!("sample.{extension}"));
        let bytes = [0xff, 0x00, 0x80, 0x42];
        std::fs::write(&path, bytes).unwrap();
        let doc = documents.open(&path).unwrap();
        assert_eq!(doc.kind, "resource");
        assert!(doc.content.is_empty());
        let response =
            super::super::resource_bridge::load(&documents, &doc.id, &doc.relative_path, "GET");
        assert_eq!(response.code, 200);
        assert_eq!(response.content, bytes);
        assert_ne!(response.mime, "application/octet-stream");
        assert!(documents.save(&doc.id, "overwrite", &doc.revision).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        std::fs::write(&path, [1, 2, 3]).unwrap();
        assert_ne!(documents.read(&doc.id).unwrap().revision, doc.revision);
        documents.close(&doc.id);
        assert_eq!(
            super::super::resource_bridge::load(&documents, &doc.id, &doc.relative_path, "GET")
                .code,
            404
        );
    }
}

#[test]
fn refuses_unknown_hidden_and_oversized_browser_resources() {
    let root = tempfile::tempdir().unwrap();
    let documents = Documents::default();
    for name in ["archive.zip", ".hidden.png"] {
        let path = root.path().join(name);
        std::fs::write(&path, "data").unwrap();
        assert!(documents.open(&path).is_err());
    }
    let large = root.path().join("large.mp4");
    std::fs::File::create(&large)
        .unwrap()
        .set_len(super::super::resource_bridge::LIMIT + 1)
        .unwrap();
    assert!(documents.open(&large).is_err());
}

#[test]
fn returns_full_source_paths_for_open_read_save_and_linked_documents() {
    let root = tempfile::tempdir().unwrap();
    let nested = root.path().join("site");
    std::fs::create_dir(&nested).unwrap();
    let path = nested.join("index.html");
    let next = nested.join("next page.html");
    std::fs::write(&path, "page").unwrap();
    std::fs::write(&next, "next").unwrap();
    let documents = Documents::default();
    let opened = documents.open_at(root.path(), "site/index.html").unwrap();
    let expected = path.canonicalize().unwrap();
    assert_eq!(opened.path, expected);
    assert_eq!(documents.read(&opened.id).unwrap().path, expected);
    assert_eq!(
        documents
            .save(&opened.id, "edited", &opened.revision)
            .unwrap()
            .path,
        expected
    );
    assert_eq!(
        documents
            .open_link(&opened.id, "next%20page.html")
            .unwrap()
            .path,
        next.canonicalize().unwrap()
    );
}

#[test]
fn previews_selected_documents_in_hidden_directories_without_exposing_other_hidden_paths() {
    let root = tempfile::tempdir().unwrap();
    let folder = root.path().join(".scratch/reports");
    std::fs::create_dir_all(folder.join("assets")).unwrap();
    std::fs::create_dir_all(root.path().join(".scratch/other")).unwrap();
    std::fs::write(folder.join("report.html"), "<img src='assets/chart.svg'>").unwrap();
    std::fs::write(folder.join("next.md"), "# Next").unwrap();
    std::fs::write(folder.join("assets/chart.svg"), "<svg/>").unwrap();
    std::fs::write(folder.join(".env"), "secret").unwrap();
    std::fs::write(root.path().join(".scratch/other/secret.txt"), "secret").unwrap();
    let documents = Documents::default();
    let opened = documents
        .open_at(root.path(), ".scratch/reports/report.html")
        .unwrap();
    for relative in [
        ".scratch/reports/report.html",
        ".scratch/reports/assets/chart.svg",
    ] {
        let response = super::super::resource_bridge::load(&documents, &opened.id, relative, "GET");
        assert_eq!(response.code, 200, "{relative}");
    }
    assert_eq!(
        documents
            .resolve_link(&opened.id, "next.md#heading")
            .unwrap()
            .relative,
        ".scratch/reports/next.md"
    );
    let linked = documents.open_link(&opened.id, "next.md").unwrap();
    assert_eq!(linked.content, "# Next");
    assert_eq!(
        documents
            .save(&opened.id, "updated", &opened.revision)
            .unwrap()
            .content,
        "updated"
    );
    for relative in [
        ".scratch/reports/.env",
        ".scratch/other/secret.txt",
        "../outside.txt",
    ] {
        assert!(
            documents.resource(&opened.id, relative).is_err(),
            "{relative}"
        );
    }
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(folder.join(".env"), folder.join("visible.txt")).unwrap();
        assert!(documents
            .resource(&opened.id, ".scratch/reports/visible.txt")
            .is_err());
    }
    documents.close(&opened.id);
    assert!(documents
        .resource(&opened.id, ".scratch/reports/report.html")
        .is_err());
}
