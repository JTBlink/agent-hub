#![cfg(unix)]
use app_lib::core::herdr_tools::{HerdrTools, ReleaseManifest};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, io::Cursor};

#[test]
fn managed_update_keeps_old_version_when_download_verification_fails() {
    let directory = tempfile::tempdir().unwrap();
    let tools = HerdrTools::new(directory.path().into());
    let bytes = b"#!/bin/sh\nprintf 'herdr 1.2.3\\n'\n";
    let target = "macos-aarch64";
    let release = ReleaseManifest {
        version: "1.2.3".into(),
        assets: HashMap::from([(
            target.into(),
            "https://github.com/herdrdev/herdr/releases/download/v1.2.3/herdr-macos-aarch64".into(),
        )]),
        sha256: HashMap::from([(target.into(), hex::encode(Sha256::digest(bytes)))]),
    };
    let installed = tools
        .prepare_release(&release, target, Cursor::new(bytes))
        .unwrap();
    assert_eq!(installed.version, "1.2.3");
    assert!(std::path::Path::new(&installed.path).is_file());
    let mut update = release.clone();
    update.version = "1.2.4".into();
    assert!(tools
        .prepare_release(&update, target, Cursor::new(b"corrupt"))
        .is_err());
    let retained = tools.managed_installation().unwrap().unwrap();
    assert_eq!(retained.version, "1.2.3");
    assert_eq!(retained.path, installed.path);
}
