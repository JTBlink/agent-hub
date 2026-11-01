use super::*;
use std::io::Write;
use tempfile::tempdir;
use zip::write::SimpleFileOptions;

fn make_skill_dir(parent: &Path, dir_name: &str, meta_name: Option<&str>) -> PathBuf {
    let dir = parent.join(dir_name);
    std::fs::create_dir_all(&dir).unwrap();
    if let Some(name) = meta_name {
        std::fs::write(dir.join("SKILL.md"), format!("---\nname: {}\n---\n", name)).unwrap();
    }
    dir
}

#[test]
fn unique_dest_returns_base_when_free() {
    let tmp = tempdir().unwrap();
    let source = make_skill_dir(tmp.path(), "source", Some("a-b"));
    let dest = unique_skill_dest(tmp.path(), "a-b", &source).unwrap();
    assert_eq!(dest, tmp.path().join("a-b"));
}

#[test]
fn unique_dest_reuses_base_for_same_content() {
    let tmp = tempdir().unwrap();
    let existing = make_skill_dir(tmp.path(), "a-b", Some("A B"));
    let source = make_skill_dir(tmp.path(), "source", Some("A B"));
    std::fs::write(existing.join("body.md"), "same").unwrap();
    std::fs::write(source.join("body.md"), "same").unwrap();

    let dest = unique_skill_dest(tmp.path(), "a-b", &source).unwrap();
    assert_eq!(dest, tmp.path().join("a-b"));
}

#[test]
fn unique_dest_uses_suffix_for_different_content_even_if_name_matches() {
    let tmp = tempdir().unwrap();
    let existing = make_skill_dir(tmp.path(), "a-b", Some("A-B"));
    let source = make_skill_dir(tmp.path(), "source", Some("A-B"));
    std::fs::write(existing.join("body.md"), "old").unwrap();
    std::fs::write(source.join("body.md"), "new").unwrap();

    let dest = unique_skill_dest(tmp.path(), "a-b", &source).unwrap();
    assert_eq!(dest, tmp.path().join("a-b-2"));
}

#[test]
fn unique_dest_reuses_existing_suffix_for_same_content() {
    let tmp = tempdir().unwrap();
    let first = make_skill_dir(tmp.path(), "a-b", Some("A-B"));
    let second = make_skill_dir(tmp.path(), "a-b-2", Some("A-B"));
    let source = make_skill_dir(tmp.path(), "source", Some("A-B"));
    std::fs::write(first.join("body.md"), "first").unwrap();
    std::fs::write(second.join("body.md"), "second").unwrap();
    std::fs::write(source.join("body.md"), "second").unwrap();

    let dest = unique_skill_dest(tmp.path(), "a-b", &source).unwrap();
    assert_eq!(dest, tmp.path().join("a-b-2"));
}

#[test]
fn install_skill_dir_refuses_destination_inside_source() {
    let tmp = tempdir().unwrap();
    let source = make_skill_dir(tmp.path(), "skills", Some("skills"));
    std::fs::write(source.join("body.md"), "data").unwrap();
    let destination = source.join("skills");

    let err = install_skill_dir_to_destination(&source, "skills", &destination)
        .err()
        .expect("expected refusal");
    assert!(
        err.to_string().contains("infinite recursion"),
        "unexpected error: {err}"
    );
    // The source must not be touched, and no nested copy must exist.
    assert!(source.join("body.md").exists());
    assert!(!destination.exists());
}

#[test]
fn unique_dest_legacy_no_metadata_base_can_reinstall_if_content_matches() {
    let tmp = tempdir().unwrap();
    let existing = make_skill_dir(tmp.path(), "legacy", None);
    let source = make_skill_dir(tmp.path(), "source", None);
    std::fs::write(existing.join("body.md"), "same").unwrap();
    std::fs::write(source.join("body.md"), "same").unwrap();

    let dest = unique_skill_dest(tmp.path(), "legacy", &source).unwrap();
    assert_eq!(dest, tmp.path().join("legacy"));
}

/// An archive source is prepared by the same extraction, so the tiebreaker
/// has to answer for it exactly as it does for a directory: a CRLF archive
/// of the same skill is not an update. Covers the only source shape where
/// the comparison re-extracts rather than re-walking.
#[test]
fn eol_insensitive_hash_sees_through_an_archive_with_crlf_content() {
    let tmp = tempdir().unwrap();
    let archive = tmp.path().join("demo.skill");
    write_skill_archive(&archive, "line one\r\nline two\r\n");

    let extracted = tmp.path().join("extracted");
    std::fs::create_dir_all(&extracted).unwrap();
    std::fs::write(extracted.join("SKILL.md"), "---\nname: Demo Skill\n---\n").unwrap();
    std::fs::write(extracted.join("body.md"), "line one\nline two\n").unwrap();

    assert_ne!(
        hash_local_source(&archive).unwrap(),
        content_hash::hash_directory(&extracted).unwrap(),
        "the byte hashes disagree, which is what sends the check to the tiebreaker"
    );
    assert_eq!(
        hash_local_source_eol_insensitive(&archive).unwrap(),
        content_hash::hash_directory_eol_insensitive(&extracted).unwrap()
    );
}

fn write_skill_archive(path: &Path, body: &str) {
    let file = std::fs::File::create(path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default();
    zip.start_file("demo-skill/SKILL.md", options).unwrap();
    zip.write_all(b"---\nname: Demo Skill\n---\n").unwrap();
    zip.start_file("demo-skill/body.md", options).unwrap();
    zip.write_all(body.as_bytes()).unwrap();
    zip.finish().unwrap();
}

#[test]
fn hash_local_source_matches_extracted_archive_representation() {
    let tmp = tempdir().unwrap();
    let archive = tmp.path().join("demo.skill");
    write_skill_archive(&archive, "same content");

    let extracted = tmp.path().join("extracted");
    std::fs::create_dir_all(&extracted).unwrap();
    std::fs::write(extracted.join("SKILL.md"), "---\nname: Demo Skill\n---\n").unwrap();
    std::fs::write(extracted.join("body.md"), "same content").unwrap();

    let archive_hash = hash_local_source(&archive).unwrap();
    let dir_hash = content_hash::hash_directory(&extracted).unwrap();

    assert_eq!(archive_hash, dir_hash);
}

#[test]
fn hash_local_source_detects_archive_content_changes() {
    let tmp = tempdir().unwrap();
    let archive = tmp.path().join("demo.zip");
    write_skill_archive(&archive, "v1");
    let first_hash = hash_local_source(&archive).unwrap();

    write_skill_archive(&archive, "v2");
    let second_hash = hash_local_source(&archive).unwrap();

    assert_ne!(first_hash, second_hash);
}
