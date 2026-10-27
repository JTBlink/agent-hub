use std::path::Path;

#[cfg(target_os = "macos")]
pub(super) fn data_url(icon: &Path) -> Option<String> {
    use base64::Engine;
    let temporary = tempfile::tempdir().ok()?;
    let output = temporary.path().join("icon.png");
    // sips writes only this temporary output, leaving installed app resources intact.
    super::process::read_command(
        "/usr/bin/sips",
        &[
            "-s",
            "format",
            "png",
            "-Z",
            "96",
            icon.to_str()?,
            "--out",
            output.to_str()?,
        ],
    )
    .ok()?;
    if output.metadata().ok()?.len() > 256 * 1024 {
        return None;
    }
    let bytes = std::fs::read(output).ok()?;
    if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return None;
    }
    Some(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

#[cfg(not(target_os = "macos"))]
pub(super) fn data_url(_icon: &Path) -> Option<String> {
    None
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
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
}
