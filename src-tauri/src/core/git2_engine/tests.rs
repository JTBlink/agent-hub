use super::*;
use std::process::Command;

/// Platform-correct file URL: Windows paths need forward slashes and a
/// third slash before the drive letter (`file:///C:/...`).
fn file_url(path: &Path) -> String {
    let s = path.display().to_string().replace('\\', "/");
    if s.starts_with('/') {
        format!("file://{s}")
    } else {
        format!("file:///{s}")
    }
}

fn git(dir: &Path, args: &[&str]) {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(["-c", "user.email=test@example.com", "-c", "user.name=Test"])
        .args(args)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

#[test]
fn applies_to_requires_flag_and_https() {
    // Default off: nothing routes to git2.
    assert!(!applies_to("https://github.com/a/b.git"));
    PILOT_ENABLED.store(true, Ordering::Relaxed);
    assert!(applies_to("https://github.com/a/b.git"));
    assert!(applies_to("HTTP://example.com/a/b.git"));
    assert!(!applies_to("git@github.com:a/b.git"));
    assert!(!applies_to("ssh://git@github.com/a/b.git"));
    assert!(!applies_to("/local/path"));
    PILOT_ENABLED.store(false, Ordering::Relaxed);
}

#[test]
fn push_fetch_ls_remote_roundtrip_against_local_remote() {
    let tmp = tempfile::tempdir().unwrap();
    let remote = tmp.path().join("remote.git");
    let work = tmp.path().join("work");
    std::fs::create_dir_all(&work).unwrap();
    assert!(Command::new("git")
        .args(["init", "--bare", "--initial-branch=main"])
        .arg(&remote)
        .output()
        .unwrap()
        .status
        .success());
    let url = file_url(&remote);

    git(&work, &["init", "-b", "main"]);
    git(&work, &["remote", "add", "origin", &url]);
    std::fs::write(work.join("a.txt"), "v1").unwrap();
    git(&work, &["add", "-A"]);
    git(&work, &["commit", "-m", "v1"]);
    git(&work, &["tag", "sm-v-20260101-000000-abc"]);

    // Push branch + tag through git2.
    push_refs(
        &work,
        &[
            "refs/heads/main:refs/heads/main".to_string(),
            "refs/tags/sm-v-20260101-000000-abc:refs/tags/sm-v-20260101-000000-abc".to_string(),
        ],
        &url,
    )
    .unwrap();

    // Remote now lists both refs.
    let refs = ls_remote_refs(&url).unwrap();
    assert!(refs.iter().any(|r| r == "refs/heads/main"), "{refs:?}");
    assert!(
        refs.iter()
            .any(|r| r == "refs/tags/sm-v-20260101-000000-abc"),
        "{refs:?}"
    );

    // git2 push updated the local remote-tracking ref (parity with
    // system git — ahead/behind and upstream health depend on it).
    let out = Command::new("git")
        .arg("-C")
        .arg(&work)
        .args(["rev-parse", "refs/remotes/origin/main"])
        .output()
        .unwrap();
    assert!(out.status.success(), "tracking ref missing after git2 push");

    // Fetch through git2 from a second clone after a new remote commit.
    let other = tmp.path().join("other");
    clone(&url, &other).unwrap();
    std::fs::write(other.join("b.txt"), "from other").unwrap();
    git(&other, &["add", "-A"]);
    git(&other, &["commit", "-m", "v2"]);
    push_refs(
        &other,
        &["refs/heads/main:refs/heads/main".to_string()],
        &url,
    )
    .unwrap();

    fetch(&work, Some("main"), &url).unwrap();
    let out = Command::new("git")
        .arg("-C")
        .arg(&work)
        .args(["rev-list", "--count", "main..origin/main"])
        .output()
        .unwrap();
    assert_eq!(
        String::from_utf8_lossy(&out.stdout).trim(),
        "1",
        "fetch should see the new remote commit"
    );
}

#[test]
fn push_rejection_reports_non_fast_forward_vocabulary() {
    let tmp = tempfile::tempdir().unwrap();
    let remote = tmp.path().join("remote.git");
    let a = tmp.path().join("a");
    let b = tmp.path().join("b");
    std::fs::create_dir_all(&a).unwrap();
    assert!(Command::new("git")
        .args(["init", "--bare", "--initial-branch=main"])
        .arg(&remote)
        .output()
        .unwrap()
        .status
        .success());
    let url = file_url(&remote);

    git(&a, &["init", "-b", "main"]);
    git(&a, &["remote", "add", "origin", &url]);
    std::fs::write(a.join("f.txt"), "base").unwrap();
    git(&a, &["add", "-A"]);
    git(&a, &["commit", "-m", "base"]);
    git(&a, &["push", "origin", "main"]);

    clone(&url, &b).unwrap();

    // Diverge: A pushes a new commit, B commits without pulling.
    std::fs::write(a.join("f.txt"), "from a").unwrap();
    git(&a, &["commit", "-am", "a2"]);
    git(&a, &["push", "origin", "main"]);
    std::fs::write(b.join("f.txt"), "from b").unwrap();
    git(&b, &["commit", "-am", "b2"]);

    let err = push_refs(&b, &["refs/heads/main:refs/heads/main".to_string()], &url).unwrap_err();
    let msg = format!("{err:#}").to_ascii_lowercase();
    assert!(
        msg.contains("non-fast-forward") || msg.contains("fast-forward"),
        "frontend error mapping relies on this vocabulary, got: {msg}"
    );
}
