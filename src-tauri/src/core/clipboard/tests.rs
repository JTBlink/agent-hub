use super::*;

#[test]
fn copied_files_skip_image_icons_and_text_alternatives() {
    let paths = vec![PathBuf::from("/tmp/示例 file.html")];
    assert_eq!(
        read_content(
            paths.clone(),
            || panic!("A copied file's icon must not be read as an image"),
            || panic!("A copied file's text alternative must not be read"),
        )
        .unwrap(),
        ClipboardContent::Files(paths)
    );
}

#[test]
fn image_pixels_skip_text_and_failed_image_detection_reads_literal_text() {
    assert_eq!(
        read_content(vec![], || true, || panic!("Image text must not be pasted")).unwrap(),
        ClipboardContent::Image
    );
    let text = "'/.file/id=example'\nplain text";
    assert_eq!(
        read_content(vec![], || false, || Ok(text.into())).unwrap(),
        ClipboardContent::Text(text.into())
    );
    assert!(read_content(vec![], || false, || anyhow::bail!("Clipboard unavailable")).is_err());
}
