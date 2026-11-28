use std::io::{Cursor, Read, Write};

use agent_hub_core::skill_source::{SkillSearchPage, SkillSource, SkillVersion};
use zip::{write::SimpleFileOptions, ZipWriter};

use super::*;

struct Catalog(Vec<u8>);

impl SkillSource for Catalog {
    fn search(&self, _: &str, _: Option<&str>) -> anyhow::Result<SkillSearchPage> {
        unreachable!("installing an exact version does not search the catalog")
    }

    fn versions(&self, _: &str) -> anyhow::Result<Vec<SkillVersion>> {
        unreachable!("installing an exact version does not list revisions")
    }

    fn download(&self, id: &str, version: &str) -> anyhow::Result<Box<dyn Read + Send>> {
        assert_eq!((id, version), ("engineering/review", "release-2"));
        Ok(Box::new(Cursor::new(self.0.clone())))
    }
}

fn root_archive(content: &[u8]) -> Catalog {
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    zip.start_file("SKILL.md", SimpleFileOptions::default())
        .unwrap();
    zip.write_all(content).unwrap();
    Catalog(zip.finish().unwrap().into_inner())
}

#[test]
fn names_an_unnamed_root_archive_after_its_catalog_skill_id() {
    let repo = test_repo();
    let content = b"# Review\n\nReview the selected changes.";
    let id = install_catalog_skill(
        &repo.store,
        &root_archive(content),
        "example-catalog",
        "engineering/review",
        &SkillVersion {
            version: "release-2".into(),
            sha256: None,
        },
        None,
    )
    .unwrap();

    let skill = repo.store.get_skill_by_id(&id).unwrap().unwrap();
    assert_eq!(skill.name, "review");
    assert_eq!(
        Path::new(&skill.central_path).file_name().unwrap(),
        "review"
    );
    assert_eq!(
        fs::read(Path::new(&skill.central_path).join("SKILL.md")).unwrap(),
        content
    );
}

#[test]
fn preserves_a_same_name_library_record_whose_directory_is_missing() {
    let repo = test_repo();
    let existing = write_skill_dir("review");
    let before = fs::read(existing.join("SKILL.md")).unwrap();
    repo.store
        .insert_skill(&sample_skill("existing", "review", &existing))
        .unwrap();
    fs::remove_dir_all(&existing).unwrap();

    let id = install_catalog_skill(
        &repo.store,
        &root_archive(&before),
        "example-catalog",
        "engineering/review",
        &SkillVersion {
            version: "release-2".into(),
            sha256: None,
        },
        Some("review"),
    )
    .unwrap();

    assert_ne!(id, "existing");
    assert!(!existing.exists());
    let old = repo.store.get_skill_by_id("existing").unwrap().unwrap();
    assert_eq!(old.source_type, "import");
    let skill = repo.store.get_skill_by_id(&id).unwrap().unwrap();
    assert_eq!(skill.name, "review-2");
    assert_eq!(skill.source_type, "catalog");
}

#[test]
fn registers_catalog_provenance_and_preserves_an_existing_same_name_skill() {
    let repo = test_repo();
    let existing = write_skill_dir("review");
    let before = fs::read(existing.join("SKILL.md")).unwrap();
    repo.store
        .insert_skill(&sample_skill("existing", "review", &existing))
        .unwrap();
    let id = install_catalog_skill(
        &repo.store,
        &root_archive(&before),
        "example-catalog",
        "engineering/review",
        &SkillVersion {
            version: "release-2".into(),
            sha256: None,
        },
        Some("review"),
    )
    .unwrap();

    let skill = repo.store.get_skill_by_id(&id).unwrap().unwrap();
    assert_eq!(skill.source_type, "catalog");
    assert_eq!(skill.source_ref.as_deref(), Some("example-catalog"));
    assert_eq!(skill.source_subpath.as_deref(), Some("engineering/review"));
    assert_eq!(skill.source_revision.as_deref(), Some("release-2"));
    assert_eq!(skill.name, "review-2");
    assert_eq!(fs::read(existing.join("SKILL.md")).unwrap(), before);
    assert_eq!(
        repo.store
            .get_skill_by_id("existing")
            .unwrap()
            .unwrap()
            .source_type,
        "import"
    );
    assert_eq!(
        fs::read(Path::new(&skill.central_path).join("SKILL.md")).unwrap(),
        before
    );
}
