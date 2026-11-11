use super::*;
use objc2_app_kit::NSPasteboard;
use objc2_foundation::{NSString, NSURL};

#[test]
fn native_file_references_resolve_to_real_paths_before_terminal_paste() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let original = root.join("示例 file.html");
    std::fs::write(&original, "<html></html>").unwrap();
    let reference = NSURL::fileURLWithPath(&NSString::from_str(original.to_str().unwrap()))
        .fileReferenceURL()
        .unwrap()
        .absoluteString()
        .unwrap();
    assert!(reference.to_string().contains("/.file/id="));
    let board = NSPasteboard::pasteboardWithUniqueName();
    board.clearContents();
    assert!(board.setString_forType(&reference, &NSString::from_str("public.file-url")));

    let renamed = root.join("改名后的 it's $file.html");
    std::fs::rename(&original, &renamed).unwrap();
    let paths = read_pasteboard(&board).unwrap();
    assert_eq!(paths, std::slice::from_ref(&renamed));
    let input = crate::core::terminal::clipboard::file_input(&paths)
        .unwrap()
        .unwrap();
    assert_eq!(
        shell_words::split(&input).unwrap(),
        [renamed.to_str().unwrap()]
    );
    let destination = root.join("destination");
    std::fs::create_dir(&destination).unwrap();
    crate::core::project_file_actions::paste::copy_into(&destination, "", &paths).unwrap();
    assert_eq!(
        std::fs::read(destination.join(renamed.file_name().unwrap())).unwrap(),
        b"<html></html>"
    );

    std::fs::remove_file(&renamed).unwrap();
    assert!(read_pasteboard(&board).is_err());
    board.clearContents();
}

#[test]
fn native_pasteboard_reads_file_urls_but_ignores_plain_paths() {
    // A named pasteboard leaves the user's real clipboard untouched.
    let board = NSPasteboard::pasteboardWithUniqueName();
    board.clearContents();
    assert!(board.setString_forType(
        &NSString::from_str("file:///tmp/demo%20files/%E4%BD%A0%E5%A5%BD.md"),
        &NSString::from_str("public.file-url"),
    ));
    assert_eq!(
        read_pasteboard(&board).unwrap(),
        [PathBuf::from("/tmp/demo files/你好.md")]
    );
    assert_eq!(
        crate::core::terminal::clipboard::file_input(&read_pasteboard(&board).unwrap()).unwrap(),
        Some("'/tmp/demo files/你好.md'".into())
    );
    board.clearContents();
    assert!(board.setString_forType(
        &NSString::from_str("/tmp/example.txt"),
        &NSString::from_str("public.utf8-plain-text"),
    ));
    assert!(read_pasteboard(&board).unwrap().is_empty());
    board.clearContents();
}

#[test]
fn refuses_remote_and_non_file_clipboard_urls() {
    assert!(file_url("https://example.invalid/file.txt").is_err());
    assert!(file_url("file://remote.invalid/file.txt").is_err());
}
