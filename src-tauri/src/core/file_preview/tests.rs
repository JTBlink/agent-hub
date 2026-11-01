use super::*;

#[test]
fn preserves_nested_filename_and_exact_text_until_session_ends() {
    let previews = FilePreviews::default();
    let path = previews
        .prepare("scripts/check #示例.py", "print('ready')\r\n")
        .unwrap();
    assert!(path.ends_with("scripts/check #示例.py"));
    assert_eq!(fs::read_to_string(&path).unwrap(), "print('ready')\r\n");
    drop(previews);
    assert!(!path.exists());
}

#[test]
fn repeated_previews_never_overwrite_copies_open_in_an_editor() {
    let previews = FilePreviews::default();
    let first = previews.prepare("config.json", "{}").unwrap();
    fs::write(&first, "edited externally").unwrap();
    let next = previews.prepare("config.json", "[]").unwrap();
    assert_ne!(first, next);
    assert_eq!(fs::read_to_string(first).unwrap(), "edited externally");
    assert_eq!(fs::read_to_string(next).unwrap(), "[]");
}

#[test]
fn explicit_shutdown_removes_all_preview_copies() {
    let previews = FilePreviews::default();
    let path = previews.prepare("preview.py", "print('ready')").unwrap();
    previews.clear().unwrap();
    assert!(!path.exists());
    previews.clear().unwrap();
    assert!(previews.prepare("late.py", "text").is_err());
}

#[test]
fn rejects_paths_outside_the_preview_and_oversized_content() {
    let previews = FilePreviews::default();
    for path in [
        "",
        "../escape.py",
        "/outside.py",
        "C:/outside.py",
        "scripts\\escape.py",
    ] {
        assert!(previews.prepare(path, "text").is_err(), "{path}");
    }
    assert!(previews
        .prepare("large.txt", &"x".repeat(4 * 1024 * 1024 + 1))
        .is_err());
}
