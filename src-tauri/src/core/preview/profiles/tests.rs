use super::*;
#[test]
fn removes_only_an_inactive_custom_profile_and_its_owned_login_data() {
    let root = tempfile::tempdir().unwrap();
    let browsers = Browsers::new(root.path().into());
    let profile = BrowserProfile {
        id: "custom".into(),
        name: "Custom".into(),
        ..BrowserProfile::default()
    };
    browsers.save_profile(profile).unwrap();
    let data = root.path().join("profiles/custom");
    fs::create_dir_all(&data).unwrap();
    fs::write(data.join("Cookies"), "private").unwrap();
    let download = root.path().join("downloads/custom/report.txt");
    fs::create_dir_all(download.parent().unwrap()).unwrap();
    fs::write(&download, "download").unwrap();
    browsers
        .state
        .lock()
        .unwrap()
        .pending
        .insert("creating".into(), "custom".into());
    assert!(browsers.delete_profile("custom").is_err());
    assert!(data.join("Cookies").exists());
    browsers.state.lock().unwrap().pending.clear();
    browsers.delete_profile("custom").unwrap();
    assert!(!data.exists());
    assert!(download.exists());
    assert!(!browsers
        .profiles()
        .unwrap()
        .iter()
        .any(|profile| profile.id == "custom"));
    assert!(browsers.delete_profile("default").is_err());
    assert!(browsers.delete_profile("guest").is_err());
}
#[cfg(unix)]
#[test]
fn refuses_removing_a_profile_directory_linked_to_other_data() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let browsers = Browsers::new(root.path().into());
    browsers
        .save_profile(BrowserProfile {
            id: "custom".into(),
            name: "Custom".into(),
            ..BrowserProfile::default()
        })
        .unwrap();
    fs::create_dir(root.path().join("profiles")).unwrap();
    fs::write(outside.path().join("keep"), "original").unwrap();
    std::os::unix::fs::symlink(outside.path(), root.path().join("profiles/custom")).unwrap();
    assert!(browsers.delete_profile("custom").is_err());
    assert!(outside.path().join("keep").exists());
    assert!(browsers
        .profiles()
        .unwrap()
        .iter()
        .any(|profile| profile.id == "custom"));
}
#[test]
fn existing_profile_settings_remain_persistent_and_gain_an_isolated_guest() {
    let root = tempfile::tempdir().unwrap();
    fs::write(
        root.path().join("profiles.json"),
        r#"[{"id":"default","name":"Existing"}]"#,
    )
    .unwrap();
    let profiles = Browsers::new(root.path().into()).profiles().unwrap();
    assert_eq!(profiles[0].name, "Existing");
    assert!(!profiles[0].ephemeral);
    assert!(profiles
        .iter()
        .any(|profile| profile.id == "guest" && profile.ephemeral));
}
#[test]
#[ignore = "requires installed Chromium; validates visitor isolation and temporary profile deletion"]
fn guest_storage_is_isolated_removed_on_shutdown_and_empty_on_restart() {
    use crate::core::preview::{assets::Assets, browser::Action, documents::Documents};
    use std::sync::Arc;
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("index.html");
    fs::write(&path, "<!doctype html><title>Guest isolation</title>").unwrap();
    let docs = Arc::new(Documents::default());
    let doc = docs.open(&path).unwrap();
    let assets = Assets::start(docs).unwrap();
    let url = assets.browser_document_url(&doc.id, &doc.title);
    let browsers = Browsers::new(root.path().join("browser"));
    let guest = browsers.create("guest", &url).unwrap();
    let evaluate = |manager: &Browsers, id: &str, expression: &str| {
        manager
            .action(
                id,
                Action::Evaluate {
                    expression: expression.into(),
                },
            )
            .unwrap()
    };
    let wait_ready = |manager: &Browsers, id: &str| {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        let expression = format!(
            "location.href==={}&&document.readyState==='complete'",
            serde_json::to_string(&url).unwrap()
        );
        while evaluate(manager, id, &expression) != true {
            assert!(std::time::Instant::now() < deadline);
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
    };
    wait_ready(&browsers, &guest);
    evaluate(
        &browsers,
        &guest,
        "localStorage.setItem('visitor','private');true",
    );
    let other = browsers.create("guest", &url).unwrap();
    wait_ready(&browsers, &other);
    assert_eq!(
        evaluate(&browsers, &other, "localStorage.getItem('visitor')"),
        "private"
    );
    let default = browsers.create("default", &url).unwrap();
    wait_ready(&browsers, &default);
    assert!(evaluate(&browsers, &default, "localStorage.getItem('visitor')").is_null());
    let temporary = {
        let state = browsers.state.lock().unwrap();
        let process = state.processes["guest"].lock().unwrap();
        process
            ._temporary_profile
            .as_ref()
            .unwrap()
            .path()
            .to_path_buf()
    };
    assert!(temporary.is_dir());
    assert!(!root.path().join("browser/profiles/guest").exists());
    browsers.clear();
    assert!(!temporary.exists());
    let restarted = Browsers::new(root.path().join("browser"));
    let guest = restarted.create("guest", &url).unwrap();
    wait_ready(&restarted, &guest);
    assert!(evaluate(&restarted, &guest, "localStorage.getItem('visitor')").is_null());
    restarted.clear();
}

#[test]
fn can_edit_a_legacy_configuration_at_its_previous_capacity() {
    let root = tempfile::tempdir().unwrap();
    let mut profiles = vec![BrowserProfile::default()];
    profiles.extend((0..19).map(|index| BrowserProfile {
        id: format!("custom-{index}"),
        name: format!("Custom {index}"),
        ..BrowserProfile::default()
    }));
    fs::write(
        root.path().join("profiles.json"),
        serde_json::to_vec(&profiles).unwrap(),
    )
    .unwrap();
    let manager = Browsers::new(root.path().into());
    let mut profile = profiles[1].clone();
    profile.name = "Edited".into();
    manager.save_profile(profile).unwrap();
    assert_eq!(
        manager
            .profiles()
            .unwrap()
            .iter()
            .find(|profile| profile.id == "custom-0")
            .unwrap()
            .name,
        "Edited"
    );
    manager
        .save_profile(BrowserProfile {
            id: "last-slot".into(),
            name: "Last".into(),
            ..BrowserProfile::default()
        })
        .unwrap();
    assert!(manager
        .save_profile(BrowserProfile {
            id: "over-limit".into(),
            name: "Extra".into(),
            ..BrowserProfile::default()
        })
        .is_err());
    assert_eq!(manager.profiles().unwrap().len(), 22);
}
#[test]
fn a_locked_file_keeps_a_visible_retryable_deletion_record() {
    let root = tempfile::tempdir().unwrap();
    let manager = Browsers::new(root.path().into());
    manager
        .save_profile(BrowserProfile {
            id: "custom".into(),
            name: "Custom".into(),
            ..BrowserProfile::default()
        })
        .unwrap();
    let directory = root.path().join("profiles/custom");
    fs::create_dir_all(&directory).unwrap();
    fs::write(directory.join("Cookies"), "private").unwrap();
    assert!(manager
        .delete_profile_with("custom", |_| Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "file is locked"
        )))
        .is_err());
    assert!(
        manager
            .profiles()
            .unwrap()
            .iter()
            .find(|profile| profile.id == "custom")
            .unwrap()
            .deleting
    );
    assert!(root
        .path()
        .join("profiles/.deleting-custom/Cookies")
        .exists());
    assert!(manager
        .save_profile(BrowserProfile {
            id: "custom".into(),
            name: "Replacement".into(),
            ..BrowserProfile::default()
        })
        .is_err());
    manager.delete_profile("custom").unwrap();
    assert!(!root.path().join("profiles/.deleting-custom").exists());
    assert!(!manager
        .profiles()
        .unwrap()
        .iter()
        .any(|profile| profile.id == "custom"));
}

#[test]
fn profile_names_do_not_collide_on_case_insensitive_filesystems() {
    let root = tempfile::tempdir().unwrap();
    let manager = Browsers::new(root.path().into());
    manager
        .save_profile(BrowserProfile {
            id: "custom".into(),
            name: "Custom".into(),
            ..BrowserProfile::default()
        })
        .unwrap();
    assert!(manager
        .save_profile(BrowserProfile {
            id: "CUSTOM".into(),
            name: "Other".into(),
            ..BrowserProfile::default()
        })
        .is_err());
    assert!(manager
        .save_profile(BrowserProfile {
            id: "Default".into(),
            name: "Reserved".into(),
            ..BrowserProfile::default()
        })
        .is_err());
}
