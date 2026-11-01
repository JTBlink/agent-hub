use super::*;
#[test]
fn produces_a_small_inline_icon_without_changing_the_source() {
    let temporary = tempfile::tempdir().unwrap();
    let icon = temporary.path().join("icon.png");
    image::RgbaImage::new(64, 64).save(&icon).unwrap();
    let before = std::fs::read(&icon).unwrap();
    assert!(data_url(&icon)
        .unwrap()
        .starts_with("data:image/png;base64,"));
    assert_eq!(std::fs::read(icon).unwrap(), before);
}
