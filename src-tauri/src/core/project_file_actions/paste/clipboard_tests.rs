use super::*;
use objc2_app_kit::NSPasteboard;
use objc2_foundation::NSString;

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
