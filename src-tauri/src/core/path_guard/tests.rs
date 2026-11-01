use super::*;
use std::fs;
use tempfile::tempdir;

#[test]
fn sanitize_strips_path_separators() {
    assert_eq!(sanitize_name("foo/bar"), "foobar");
    assert_eq!(sanitize_name("foo\\bar"), "foobar");
}

#[test]
fn sanitize_blocks_traversal() {
    assert_eq!(sanitize_name("../etc/passwd"), "etcpasswd");
    assert_eq!(sanitize_name(".."), FALLBACK_NAME);
    assert_eq!(sanitize_name("../../.."), FALLBACK_NAME);
}

#[test]
fn sanitize_strips_windows_forbidden() {
    assert_eq!(sanitize_name("a:b*c?d\"e<f>g|h"), "abcdefgh");
}

#[test]
fn sanitize_strips_null_and_control() {
    assert_eq!(sanitize_name("foo\0bar"), "foobar");
    assert_eq!(sanitize_name("foo\nbar"), "foobar");
}

#[test]
fn sanitize_trims_dots_and_whitespace() {
    assert_eq!(sanitize_name("  .hidden  "), "hidden");
    assert_eq!(sanitize_name("..."), FALLBACK_NAME);
    assert_eq!(sanitize_name(".foo."), "foo");
}

#[test]
fn sanitize_collapses_consecutive_dots() {
    // ".." collapses to "." which is then trimmed away — no traversal possible.
    assert_eq!(sanitize_name("foo..bar"), "foo.bar");
}

#[test]
fn sanitize_truncates_long_names() {
    let long = "a".repeat(MAX_NAME_LEN + 50);
    let out = sanitize_name(&long);
    assert!(out.len() <= MAX_NAME_LEN);
}

#[test]
fn sanitize_empty_yields_fallback() {
    assert_eq!(sanitize_name(""), FALLBACK_NAME);
    assert_eq!(sanitize_name("   "), FALLBACK_NAME);
}

#[test]
fn sanitize_preserves_unicode() {
    assert_eq!(sanitize_name("技能-foo"), "技能-foo");
}

#[test]
fn path_safe_allows_subpath() {
    let tmp = tempdir().unwrap();
    let base = tmp.path();
    let sub = base.join("foo").join("bar");
    fs::create_dir_all(&sub).unwrap();
    assert!(is_path_safe(base, &sub));
}

#[test]
fn path_safe_rejects_sibling() {
    let tmp = tempdir().unwrap();
    let base = tmp.path().join("a");
    let other = tmp.path().join("b");
    fs::create_dir_all(&base).unwrap();
    fs::create_dir_all(&other).unwrap();
    assert!(!is_path_safe(&base, &other));
}

#[test]
fn path_safe_rejects_traversal() {
    let tmp = tempdir().unwrap();
    let base = tmp.path().join("base");
    fs::create_dir_all(&base).unwrap();
    let escape = base.join("..").join("escape");
    assert!(!is_path_safe(&base, &escape));
}

#[test]
fn path_safe_handles_non_existing_target() {
    let tmp = tempdir().unwrap();
    let base = tmp.path();
    let future = base.join("not_yet_created").join("skill");
    assert!(is_path_safe(base, &future));
}

#[test]
fn path_safe_rejects_symlink_escape() {
    #[cfg(unix)]
    {
        let tmp = tempdir().unwrap();
        let base = tmp.path().join("base");
        let outside = tmp.path().join("outside");
        fs::create_dir_all(&base).unwrap();
        fs::create_dir_all(&outside).unwrap();
        let link = base.join("escape");
        std::os::unix::fs::symlink(&outside, &link).unwrap();
        // Once canonicalized, link resolves to `outside` which is not under `base`.
        assert!(!is_path_safe(&base, &link));
    }
}

#[test]
fn path_safe_accepts_base_itself() {
    let tmp = tempdir().unwrap();
    assert!(is_path_safe(tmp.path(), tmp.path()));
}
