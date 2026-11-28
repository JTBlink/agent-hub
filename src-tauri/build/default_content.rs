use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path, PathBuf};

pub fn prepare() {
    const SNAPSHOT: &str = "default-content.json";
    const LOCK: &str = "../products/default-content.json";
    println!("cargo:rerun-if-changed={SNAPSHOT}");
    println!("cargo:rerun-if-changed={LOCK}");

    let lock: serde_json::Value =
        serde_json::from_slice(&fs::read(LOCK).expect("read default content lock"))
            .expect("parse default content lock");
    let (owner, repository) = lock["repository"]
        .as_str()
        .and_then(|source| source.split_once('/'))
        .expect("default content repository must use owner/repo");
    assert!(
        [owner, repository].into_iter().all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
        }),
        "invalid default content repository"
    );
    println!("cargo:rustc-env=AGENT_HUB_CONTENT_REPOSITORY={owner}/{repository}");
    let snapshot = fs::read(SNAPSHOT).expect("read default content snapshot");
    let digest = format!("{:x}", Sha256::digest(&snapshot));
    assert_eq!(
        lock["sha256"].as_str(),
        Some(digest.as_str()),
        "default content snapshot does not match its lock"
    );
    let root = PathBuf::from(std::env::var_os("OUT_DIR").expect("Cargo output directory"))
        .join("default-content")
        .join(digest);
    let entries: BTreeMap<String, String> =
        serde_json::from_slice(&snapshot).expect("parse default content snapshot");
    for (name, content) in entries {
        let path = Path::new(&name);
        assert!(
            (name.starts_with("skills/") || name.starts_with("automations/"))
                && name.split('/').all(|part| !matches!(part, "" | "." | ".."))
                && !name.contains(['\\', ':'])
                && path
                    .components()
                    .all(|part| matches!(part, Component::Normal(_))),
            "unexpected default content path: {name}"
        );
        let target = root.join(path);
        fs::create_dir_all(target.parent().expect("default content parent"))
            .expect("create default content directory");
        fs::write(target, content).expect("write default content file");
    }
    println!(
        "cargo:rustc-env=AGENT_HUB_DEFAULT_CONTENT_DIR={}",
        root.display()
    );
}
