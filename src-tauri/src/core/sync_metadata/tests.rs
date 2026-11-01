use super::*;
use crate::core::{central_repo, skill_store::SkillStore};
use std::sync::MutexGuard;
use tempfile::{tempdir, TempDir};

struct TestRepo {
    _lock: MutexGuard<'static, ()>,
    _tmp: TempDir,
    store: SkillStore,
}

impl Drop for TestRepo {
    fn drop(&mut self) {
        central_repo::set_test_base_dir_override(None);
    }
}

fn test_repo() -> TestRepo {
    let lock = central_repo::test_base_dir_lock();
    let tmp = tempdir().unwrap();
    let base = tmp.path().join("repo");
    central_repo::set_test_base_dir_override(Some(base.clone()));
    fs::create_dir_all(central_repo::skills_dir()).unwrap();
    let store = SkillStore::new(&base.join("test.db")).unwrap();
    TestRepo {
        _lock: lock,
        _tmp: tmp,
        store,
    }
}

fn write_skill_dir(name: &str) -> PathBuf {
    let dir = central_repo::skills_dir().join(name);
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("SKILL.md"), format!("---\nname: {name}\n---\n")).unwrap();
    dir
}

fn sample_skill(id: &str, central_path: &Path) -> SkillRecord {
    SkillRecord {
        id: id.to_string(),
        name: id.to_string(),
        description: None,
        source_type: "import".to_string(),
        source_ref: Some(central_path.to_string_lossy().to_string()),
        source_ref_resolved: None,
        source_subpath: None,
        source_branch: None,
        source_revision: None,
        source_agent: None,
        remote_revision: None,
        central_path: central_path.to_string_lossy().to_string(),
        content_hash: None,
        enabled: true,
        created_at: 1,
        updated_at: 1,
        status: "ok".to_string(),
        update_status: "local_only".to_string(),
        last_checked_at: None,
        last_check_error: None,
    }
}

#[test]
fn incomplete_metadata_snapshot_does_not_delete_existing_skills() {
    let repo = test_repo();
    let skill_dir = write_skill_dir("example-skill");
    repo.store
        .insert_skill(&sample_skill("skill-1", &skill_dir))
        .unwrap();

    fs::create_dir_all(metadata_dir()).unwrap();
    fs::write(metadata_dir().join("schema.json"), "{}").unwrap();

    let err = reindex_from_metadata_unlocked(&repo.store).unwrap_err();
    assert!(err.to_string().contains("incomplete sync metadata"));
    assert!(repo.store.get_skill_by_id("skill-1").unwrap().is_some());
}

#[test]
fn empty_skill_metadata_does_not_delete_central_skills() {
    let repo = test_repo();
    let skill_dir = write_skill_dir("example-skill");
    repo.store
        .insert_skill(&sample_skill("skill-1", &skill_dir))
        .unwrap();

    fs::create_dir_all(metadata_dir().join("skills")).unwrap();
    fs::write(metadata_dir().join("schema.json"), "{}").unwrap();

    let err = reindex_from_metadata_unlocked(&repo.store).unwrap_err();
    assert!(err.to_string().contains("contains no skills"));
    assert!(repo.store.get_skill_by_id("skill-1").unwrap().is_some());
}

#[test]
fn metadata_reindex_preserves_skill_id_and_tags() {
    let source = test_repo();
    let skill_dir = write_skill_dir("example-skill");
    source
        .store
        .insert_skill(&sample_skill("skill-1", &skill_dir))
        .unwrap();
    source
        .store
        .set_tags_for_skill("skill-1", &["tag-b".to_string(), "tag-a".to_string()])
        .unwrap();
    write_all_from_db_unlocked(&source.store).unwrap();

    let restored_store = SkillStore::new(&central_repo::base_dir().join("restored.db")).unwrap();
    reindex_from_metadata_unlocked(&restored_store).unwrap();

    let restored = restored_store
        .get_skill_by_id("skill-1")
        .unwrap()
        .expect("skill should be restored from metadata");
    assert_eq!(restored.central_path, skill_dir.to_string_lossy());
    assert_eq!(
        restored_store
            .get_tags_map()
            .unwrap()
            .remove("skill-1")
            .unwrap(),
        vec!["tag-a".to_string(), "tag-b".to_string()]
    );
}

#[test]
fn reindex_preserves_updated_at_when_content_unchanged() {
    let repo = test_repo();
    let skill_dir = write_skill_dir("stable-skill");

    let mut record = sample_skill("skill-stable", &skill_dir);
    record.updated_at = 1_000_000;
    record.content_hash = Some(super::super::content_hash::hash_directory(&skill_dir).unwrap());
    repo.store.insert_skill(&record).unwrap();
    write_all_from_db_unlocked(&repo.store).unwrap();

    reindex_from_metadata_unlocked(&repo.store).unwrap();

    let after = repo
        .store
        .get_skill_by_id("skill-stable")
        .unwrap()
        .expect("skill must still exist");
    assert_eq!(
        after.updated_at, 1_000_000,
        "updated_at must not change when skill content is unchanged"
    );
}

#[test]
fn reindex_updates_updated_at_when_content_changes() {
    let repo = test_repo();
    let skill_dir = write_skill_dir("changing-skill");

    let mut record = sample_skill("skill-changing", &skill_dir);
    record.updated_at = 1_000_000;
    record.content_hash = Some("old-hash-before-change".to_string());
    repo.store.insert_skill(&record).unwrap();
    write_all_from_db_unlocked(&repo.store).unwrap();

    // Modify the skill content so the hash changes
    fs::write(skill_dir.join("extra.md"), "new content").unwrap();

    reindex_from_metadata_unlocked(&repo.store).unwrap();

    let after = repo
        .store
        .get_skill_by_id("skill-changing")
        .unwrap()
        .expect("skill must still exist");
    assert_ne!(
        after.updated_at, 1_000_000,
        "updated_at must be refreshed when skill content changes"
    );
}
