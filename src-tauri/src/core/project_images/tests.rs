use super::*;

fn image(root: &Path, revision: ImageRevision, sha: Option<&str>) -> Option<Vec<u8>> {
    read_image(root, "icon.png", revision, sha).unwrap()
}

fn png(marker: &[u8]) -> Vec<u8> {
    use image::ImageEncoder;
    let mut bytes = Vec::new();
    image::codecs::png::PngEncoder::new(&mut bytes)
        .write_image(&[0, 0, 0, 255], 1, 1, image::ExtendedColorType::Rgba8)
        .unwrap();
    bytes.extend_from_slice(marker);
    bytes
}

#[test]
fn reads_distinct_working_index_head_and_commit_images() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let repo = git2::Repository::init(root).unwrap();
    assert!(image(root, ImageRevision::Head, None).is_none());
    assert!(image(root, ImageRevision::Index, None).is_none());
    std::fs::write(root.join("icon.png"), png(b"original")).unwrap();
    let mut index = repo.index().unwrap();
    index.add_path(Path::new("icon.png")).unwrap();
    index.write().unwrap();
    let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
    let sig = git2::Signature::now("Test", "user@example.invalid").unwrap();
    let id = repo
        .commit(Some("HEAD"), &sig, &sig, "Initial image", &tree, &[])
        .unwrap();
    let sha = id.to_string();
    std::fs::write(root.join("icon.png"), png(b"staged")).unwrap();
    index.add_path(Path::new("icon.png")).unwrap();
    index.write().unwrap();
    std::fs::write(root.join("icon.png"), png(b"working")).unwrap();
    assert_eq!(
        image(root, ImageRevision::Working, None).unwrap(),
        png(b"working")
    );
    assert_eq!(
        image(root, ImageRevision::Index, None).unwrap(),
        png(b"staged")
    );
    assert_eq!(
        image(root, ImageRevision::Head, None).unwrap(),
        png(b"original")
    );
    assert_eq!(
        image(root, ImageRevision::Commit, Some(&sha)).unwrap(),
        png(b"original")
    );
    assert!(image(root, ImageRevision::Parent, Some(&sha)).is_none());
    let parent = repo.find_commit(id).unwrap();
    let next = repo.find_tree(index.write_tree().unwrap()).unwrap();
    let next_id = repo
        .commit(Some("HEAD"), &sig, &sig, "Update image", &next, &[&parent])
        .unwrap();
    assert_eq!(
        image(root, ImageRevision::Parent, Some(&next_id.to_string())).unwrap(),
        png(b"original")
    );
    std::fs::remove_file(root.join("icon.png")).unwrap();
    assert!(image(root, ImageRevision::Working, None).is_none());
    assert_eq!(
        image(root, ImageRevision::Commit, Some(&sha)).unwrap(),
        png(b"original")
    );
    assert!(read_image(root, "icon.png", ImageRevision::Commit, Some("HEAD")).is_err());
}

#[test]
fn previews_untracked_images_in_plain_folders_and_bounds_reads() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::write(temp.path().join("icon.png"), png(b"new image")).unwrap();
    let preview = read_image(temp.path(), "icon.png", ImageRevision::Working, None)
        .unwrap()
        .unwrap();
    assert_eq!(preview, png(b"new image"));
    assert!(read_image(temp.path(), "../icon.png", ImageRevision::Working, None).is_err());
    assert!(read_image(temp.path(), "notes.txt", ImageRevision::Working, None).is_err());
    std::fs::File::create(temp.path().join("icon.png"))
        .unwrap()
        .set_len(MAX_IMAGE_BYTES as u64 + 1)
        .unwrap();
    assert!(
        read_image(temp.path(), "icon.png", ImageRevision::Working, None)
            .unwrap_err()
            .to_string()
            .contains("20 MiB")
    );
}

#[cfg(unix)]
#[test]
fn refuses_links_outside_the_checkout() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::fs::write(outside.path().join("icon.png"), b"private").unwrap();
    std::os::unix::fs::symlink(outside.path(), root.path().join("linked")).unwrap();
    assert!(read_image(root.path(), "linked/icon.png", ImageRevision::Working, None).is_err());
}

#[test]
fn rejects_corrupt_and_empty_images_without_decoding_pixels() {
    let temp = tempfile::tempdir().unwrap();
    for bytes in [b"".as_slice(), b"not an image"] {
        std::fs::write(temp.path().join("icon.png"), bytes).unwrap();
        assert!(read_image(temp.path(), "icon.png", ImageRevision::Working, None).is_err());
    }
    // A tiny PNG header can declare a huge decoded image.
    let mut bytes = png(b"");
    bytes[16..20].copy_from_slice(&40_000_u32.to_be_bytes());
    std::fs::write(temp.path().join("icon.png"), bytes).unwrap();
    assert!(read_image(temp.path(), "icon.png", ImageRevision::Working, None).is_err());
}

#[test]
fn preserves_each_supported_image_format_without_transcoding() {
    let temp = tempfile::tempdir().unwrap();
    let picture = image::DynamicImage::new_rgba8(2, 2);
    for (extension, format) in [
        ("png", image::ImageFormat::Png),
        ("jpeg", image::ImageFormat::Jpeg),
        ("gif", image::ImageFormat::Gif),
        ("webp", image::ImageFormat::WebP),
        ("bmp", image::ImageFormat::Bmp),
        ("ico", image::ImageFormat::Ico),
    ] {
        let mut output = std::io::Cursor::new(Vec::new());
        if extension == "jpeg" {
            image::DynamicImage::ImageRgb8(picture.to_rgb8())
                .write_to(&mut output, format)
                .unwrap();
        } else {
            picture.write_to(&mut output, format).unwrap();
        }
        let bytes = output.into_inner();
        let path = format!("icon.{extension}");
        std::fs::write(temp.path().join(&path), &bytes).unwrap();
        assert_eq!(
            read_image(temp.path(), &path, ImageRevision::Working, None)
                .unwrap()
                .unwrap(),
            bytes
        );
    }
    let svg = br#"<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><circle cx="24" cy="24" r="20" fill="none"/></svg>"#;
    std::fs::write(temp.path().join("icon.svg"), svg).unwrap();
    assert_eq!(
        read_image(temp.path(), "icon.svg", ImageRevision::Working, None)
            .unwrap()
            .unwrap(),
        svg
    );
}
