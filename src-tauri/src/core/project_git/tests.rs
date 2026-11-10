use super::*;

#[test]
fn ordinary_folders_are_not_errors_but_damaged_repositories_are() {
    let parent = tempfile::tempdir().unwrap();
    git2::Repository::init(parent.path()).unwrap();
    let folder = parent.path().join("ordinary");
    std::fs::create_dir(&folder).unwrap();
    assert!(inspect(&folder).unwrap().is_none());
    assert!(!folder.join(".git").exists());
    std::fs::write(folder.join(".git"), "invalid repository").unwrap();
    assert!(inspect(&folder).is_err());
    assert!(inspect(&parent.path().join("missing")).is_err());
}

/// Manual benchmark: set AGENT_HUB_GIT_PROFILE_ROOT to a checkout, then run
/// `cargo test --lib benchmark_status_loading -- --ignored --nocapture`.
#[test]
#[ignore = "Requires an explicitly selected local checkout; reports timings without a flaky threshold"]
fn benchmark_status_loading() {
    let root = std::env::var("AGENT_HUB_GIT_PROFILE_ROOT").expect("Select a checkout to benchmark");
    for iteration in 1..=3 {
        let repo = actions::repository(Path::new(&root)).unwrap();
        let mut options = git2::StatusOptions::new();
        options
            .include_untracked(true)
            .recurse_untracked_dirs(true)
            .include_ignored(false);
        let start = std::time::Instant::now();
        let files = repo.statuses(Some(&mut options)).unwrap();
        eprintln!(
            "libgit2 scan {iteration}: {:?}; files={}",
            start.elapsed(),
            files.len(),
        );
        let start = std::time::Instant::now();
        let result = status(Path::new(&root)).unwrap();
        eprintln!(
            "status {iteration}: {:?}; files={}; commits={}",
            start.elapsed(),
            result.files.len(),
            result.commits.len(),
        );
    }
}

#[test]
fn inspects_unborn_repositories_and_untracked_diffs_without_writes() {
    let temp = tempfile::tempdir().unwrap();
    git2::Repository::init(temp.path()).unwrap();
    std::fs::write(temp.path().join("demo.rs"), "fn main() {}\n").unwrap();
    let status = status(temp.path()).unwrap();
    assert_eq!(status.files.len(), 1);
    assert!(status.files[0].unstaged);
    assert!(!status.files[0].staged);
    assert!(diff(temp.path(), "demo.rs", false)
        .unwrap()
        .contains("+fn main() {}"));
    assert!(diff(temp.path(), "../outside", false).is_err());
}
