use super::*;
use std::io::Write;
use zip::write::SimpleFileOptions;

fn archive(path: &Path, marker: Option<&str>, marker_is_directory: bool) {
    let file = std::fs::File::create(path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default();
    zip.start_file("package/README.md", options).unwrap();
    zip.write_all(b"Ordinary documentation").unwrap();
    if let Some(marker) = marker {
        if marker_is_directory {
            zip.add_directory(format!("package/{marker}/"), options)
                .unwrap();
        } else {
            zip.start_file(format!("package/{marker}"), options)
                .unwrap();
            zip.write_all(b"---\nname: example-skill\n---\nSkill instructions")
                .unwrap();
        }
    }
    zip.finish().unwrap();
}

#[test]
fn rejects_non_skill_directory_before_creating_or_replacing_destination() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("ordinary-folder");
    std::fs::create_dir(&source).unwrap();
    std::fs::write(source.join("README.md"), "not a skill").unwrap();
    let destination = temp.path().join("installed");
    assert!(install_from_local_to_destination(&source, Some("forced-name"), &destination).is_err());
    assert!(!destination.exists());
    std::fs::create_dir(&destination).unwrap();
    std::fs::write(destination.join("keep.txt"), "keep").unwrap();
    assert!(install_skill_dir_to_destination(&source, "forced-name", &destination).is_err());
    assert_eq!(
        std::fs::read_to_string(destination.join("keep.txt")).unwrap(),
        "keep"
    );
}

#[test]
fn rejects_archive_without_a_real_skill_marker() {
    for extension in ["zip", "skill"] {
        for fake_directory in [false, true] {
            let temp = tempfile::tempdir().unwrap();
            let source = temp.path().join(format!("ordinary.{extension}"));
            archive(
                &source,
                fake_directory.then_some("SKILL.md"),
                fake_directory,
            );
            let destination = temp.path().join("installed");
            assert!(install_from_local_to_destination(&source, None, &destination).is_err());
            assert!(!destination.exists());
        }
    }
}

#[test]
fn imports_skill_folders_and_archives_with_supported_marker_names() {
    for marker in ["SKILL.md", "skill.md"] {
        let temp = tempfile::tempdir().unwrap();
        let folder = temp.path().join("source");
        std::fs::create_dir(&folder).unwrap();
        std::fs::write(folder.join(marker), "# Skill instructions").unwrap();
        let destination = temp.path().join("folder-copy");
        install_from_local_to_destination(&folder, None, &destination).unwrap();
        assert!(destination.join(marker).is_file());
        for extension in ["zip", "skill"] {
            let source = temp.path().join(format!("example.{extension}"));
            archive(&source, Some(marker), false);
            let destination = temp.path().join(format!("archive-copy-{extension}"));
            install_from_local_to_destination(&source, None, &destination).unwrap();
            assert!(destination.join(marker).is_file());
        }
    }
}
