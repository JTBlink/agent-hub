use std::{
    io::{Cursor, Write},
    sync::Mutex,
};

use agent_hub_core::skill_source::SkillSearchPage;
use zip::{write::SimpleFileOptions, ZipWriter};

use super::*;

struct Catalog {
    archive: Vec<u8>,
    requested: Mutex<Vec<(String, String)>>,
}

impl SkillSource for Catalog {
    fn search(&self, _: &str, _: Option<&str>) -> Result<SkillSearchPage> {
        unreachable!("installation must not search the catalog")
    }

    fn versions(&self, _: &str) -> Result<Vec<SkillVersion>> {
        unreachable!("installation must use the version chosen by the caller")
    }

    fn download(&self, id: &str, version: &str) -> Result<Box<dyn Read + Send>> {
        self.requested
            .lock()
            .unwrap()
            .push((id.to_owned(), version.to_owned()));
        Ok(Box::new(Cursor::new(self.archive.clone())))
    }
}

fn catalog(files: &[(&str, &[u8])]) -> Catalog {
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    for (path, content) in files {
        zip.start_file(path.to_string(), SimpleFileOptions::default())
            .unwrap();
        zip.write_all(content).unwrap();
    }
    Catalog {
        archive: zip.finish().unwrap().into_inner(),
        requested: Mutex::new(Vec::new()),
    }
}

#[test]
fn installs_the_exact_requested_catalog_revision_into_a_staging_directory() {
    let catalog = catalog(&[("package/SKILL.md", b"# Review instructions")]);
    let version = SkillVersion {
        version: "release-2".into(),
        sha256: Some(hex::encode_upper(Sha256::digest(&catalog.archive))),
    };
    let directory = tempfile::tempdir().unwrap();
    let destination = directory.path().join("stage");
    let result = install_from_skill_source_to_destination(
        &catalog,
        "engineering/review",
        &version,
        Some("review"),
        &destination,
    )
    .unwrap();
    assert_eq!(result.name, "review");
    assert_eq!(
        fs::read_to_string(destination.join("SKILL.md")).unwrap(),
        "# Review instructions"
    );
    assert_eq!(
        catalog.requested.lock().unwrap().as_slice(),
        &[("engineering/review".to_owned(), "release-2".to_owned())]
    );
}

#[test]
fn rejects_wrong_digest_and_archive_paths_before_creating_the_destination() {
    let valid = catalog(&[("SKILL.md", b"# Review instructions")]);
    let directory = tempfile::tempdir().unwrap();
    let destination = directory.path().join("stage");
    let mut version = SkillVersion {
        version: "1".into(),
        sha256: Some("a".repeat(64)),
    };
    let install = |catalog: &Catalog, version: &SkillVersion| {
        install_from_skill_source_to_destination(
            catalog,
            "review",
            version,
            Some("review"),
            &destination,
        )
        .err()
        .unwrap()
        .to_string()
    };
    assert!(install(&valid, &version).contains("SHA-256 mismatch"));
    assert!(!destination.exists());

    let escaping = catalog(&[("SKILL.md", b"# Review"), ("../outside", b"invalid")]);
    version.sha256 = None;
    assert!(install(&escaping, &version).contains("invalid path"));
    assert!(!destination.exists());
}

#[test]
fn keeps_an_existing_destination_intact_without_requesting_the_archive() {
    let catalog = catalog(&[("SKILL.md", b"# New")]);
    let version = SkillVersion {
        version: "2".into(),
        sha256: None,
    };
    let directory = tempfile::tempdir().unwrap();
    let destination = directory.path().join("stage");
    fs::create_dir(&destination).unwrap();
    fs::write(destination.join("SKILL.md"), "# Existing").unwrap();
    assert!(install_from_skill_source_to_destination(
        &catalog,
        "review",
        &version,
        None,
        &destination
    )
    .is_err());
    assert!(catalog.requested.lock().unwrap().is_empty());
    assert_eq!(
        fs::read_to_string(destination.join("SKILL.md")).unwrap(),
        "# Existing"
    );
}

#[test]
fn limits_expanded_file_bytes() {
    let catalog = catalog(&[("SKILL.md", b"# Review instructions")]);
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("archive.zip");
    fs::write(&path, catalog.archive).unwrap();
    let result = PreparedSource::from_archive(
        &path,
        Some(ArchiveLimits {
            entries: 1,
            extracted_bytes: 5,
        }),
    );
    assert!(result.err().unwrap().to_string().contains("size limit"));
}
