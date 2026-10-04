use super::*;
use tempfile::tempdir;

struct TagFixture {
    repository: String,
    tag: String,
    commit: String,
}

fn configured_fixture() -> TagFixture {
    TagFixture {
        repository: std::env::var("AGENTHUB_TEST_TAG_REPOSITORY")
            .expect("configure an HTTPS Git fixture repository"),
        tag: std::env::var("AGENTHUB_TEST_TAG_NAME").expect("configure the fixture tag"),
        commit: std::env::var("AGENTHUB_TEST_TAG_COMMIT").expect("configure its peeled commit"),
    }
}

#[test]
#[ignore = "requires an explicitly configured network fixture"]
fn libgit2_clones_a_tag_and_lands_on_its_commit() {
    let fixture = configured_fixture();
    let output = tempdir().unwrap();
    let destination = output.path().join("repo");
    clone_tag_with_git2(&fixture.repository, &fixture.tag, &destination, None, None).unwrap();
    let repo = git2::Repository::open(&destination).unwrap();
    assert_eq!(
        repo.head()
            .unwrap()
            .peel_to_commit()
            .unwrap()
            .id()
            .to_string(),
        fixture.commit
    );
    assert!(repo.is_shallow());
    assert!(!repo.is_bare());
}

#[test]
#[ignore = "requires a network fixture and mutates PATH; run alone"]
fn a_tag_installs_with_no_system_git_on_path() {
    let fixture = configured_fixture();
    let original = std::env::var_os("PATH");
    std::env::set_var("PATH", "");
    let result = clone_repo_ref(&fixture.repository, Some(&fixture.tag), None, None);
    match original {
        Some(path) => std::env::set_var("PATH", path),
        None => std::env::remove_var("PATH"),
    }
    let directory = result.expect("a tag source must install without system git");
    let repo = git2::Repository::open(&directory).unwrap();
    assert_eq!(
        repo.head()
            .unwrap()
            .peel_to_commit()
            .unwrap()
            .id()
            .to_string(),
        fixture.commit
    );
    drop(repo);
    cleanup_temp(&directory);
}
