use super::*;
use std::io::{Seek, Write};

#[test]
fn stable_releases_targets_and_exact_checksums_are_required() {
    assert_eq!(version("v1.12.0").unwrap(), "1.12.0");
    assert!(version("v1.12.0-rc.1").is_err());
    assert!(version("../release").is_err());
    assert_eq!(target("macos", "aarch64").unwrap(), "darwin_arm64");
    assert_eq!(target("windows", "x86_64").unwrap(), "windows_amd64");
    assert!(target("linux", "unknown").is_err());
    let hash = "a".repeat(64);
    assert_eq!(
        checksum(&format!("{hash}  glab.tar.gz\n"), "glab.tar.gz").unwrap(),
        hash
    );
    assert!(checksum(&format!("{hash}  other.tar.gz"), "glab.tar.gz").is_err());
    assert!(checksum("invalid  glab.tar.gz", "glab.tar.gz").is_err());
    assert!(checksum(&format!("{hash}  glab\n{hash}  glab"), "glab").is_err());
}

fn archive(content: &[u8], link: bool) -> File {
    let file = tempfile::tempfile().unwrap();
    let gz = flate2::write::GzEncoder::new(file, flate2::Compression::default());
    let mut tar = tar::Builder::new(gz);
    let mut header = tar::Header::new_gnu();
    header.set_size(content.len() as u64);
    header.set_mode(0o755);
    if link {
        header.set_entry_type(tar::EntryType::Symlink);
        header.set_link_name("outside").unwrap();
    }
    header.set_cksum();
    tar.append_data(&mut header, "bin/glab", content).unwrap();
    let mut file = tar.into_inner().unwrap().finish().unwrap();
    file.rewind().unwrap();
    file
}
#[test]
fn archives_extract_only_the_cli_and_reject_links_and_oversized_streams() {
    let temp = tempfile::tempdir().unwrap();
    unpack(
        archive(b"fixture", false),
        false,
        temp.path(),
        &AtomicBool::new(false),
    )
    .unwrap();
    assert_eq!(std::fs::read(temp.path().join("glab")).unwrap(), b"fixture");
    let temp = tempfile::tempdir().unwrap();
    assert!(unpack(
        archive(b"", true),
        false,
        temp.path(),
        &AtomicBool::new(false)
    )
    .is_err());
    let mut output = Vec::new();
    assert!(copy_limited(&b"long"[..], &mut output, 3, &AtomicBool::new(false)).is_err());
    assert!(output.is_empty());
}
#[test]
fn windows_zip_extracts_a_regular_binary_without_unpacking_other_files() {
    let mut file = tempfile::tempfile().unwrap();
    {
        let mut zip = zip::ZipWriter::new(&mut file);
        zip.start_file("bin/glab.exe", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"windows-fixture").unwrap();
        zip.start_file(
            "share/example.txt",
            zip::write::SimpleFileOptions::default(),
        )
        .unwrap();
        zip.write_all(b"unused").unwrap();
        zip.finish().unwrap();
    }
    file.rewind().unwrap();
    let root = tempfile::tempdir().unwrap();
    unpack(file, true, root.path(), &AtomicBool::new(false)).unwrap();
    assert_eq!(
        std::fs::read(root.path().join("glab.exe")).unwrap(),
        b"windows-fixture"
    );
    assert!(!root.path().join("share").exists());
}
/// Opt-in acceptance of the real release format; excluded from offline unit tests.
#[test]
#[ignore = "downloads and executes the official stable glab release"]
fn downloads_official_stable_release_and_reuses_verified_installation() {
    let temp = tempfile::tempdir().unwrap();
    let cli = GlabCli {
        root: temp.path().into(),
    };
    let installed = cli.install(&AtomicBool::new(false), None).unwrap();
    assert!(installed.path.is_file());
    assert_eq!(
        cli.install(&AtomicBool::new(false), None).unwrap().path,
        installed.path
    );
}
#[cfg(unix)]
#[test]
fn checksum_failure_preserves_installed_release_and_verified_publish_is_reusable() {
    let temp = tempfile::tempdir().unwrap();
    let cli = GlabCli {
        root: temp.path().into(),
    };
    let mut file = archive(b"#!/bin/sh\necho 'glab 1.2.3 (fixture)'\n", false);
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).unwrap();
    file.rewind().unwrap();
    assert!(cli
        .publish(
            "1.2.3",
            &"0".repeat(64),
            false,
            file,
            &AtomicBool::new(false)
        )
        .is_err());
    assert!(cli.managed().unwrap().is_none());
    let mut file = tempfile::tempfile().unwrap();
    file.write_all(&bytes).unwrap();
    file.rewind().unwrap();
    cli.publish(
        "1.2.3",
        &hex::encode(Sha256::digest(&bytes)),
        false,
        file,
        &AtomicBool::new(false),
    )
    .unwrap();
    let installed = cli.managed().unwrap().unwrap();
    assert!(installed.path.is_file());
    assert_eq!(installed.source, "downloaded");
    assert!(cli
        .publish(
            "1.2.4",
            &"0".repeat(64),
            false,
            archive(b"bad", false),
            &AtomicBool::new(false)
        )
        .is_err());
    assert_eq!(cli.managed().unwrap().unwrap().path, installed.path);
}
