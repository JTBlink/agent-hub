use super::*;

fn isolated(action: impl FnOnce(&Path) + std::panic::UnwindSafe) {
    let _lock = central_repo::test_base_dir_lock();
    let dir = tempfile::tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(dir.path().to_owned()));
    let result = std::panic::catch_unwind(|| action(dir.path()));
    central_repo::set_test_base_dir_override(None);
    result.unwrap();
}

fn interrupt(id: &str, existing: bool, deleting: bool) -> std::path::PathBuf {
    let stage = tempfile::tempdir_in(central_repo::base_dir()).unwrap();
    for (part, extension) in PARTS {
        if existing {
            fs::copy(
                library().join(format!("{id}.{extension}")),
                stage.path().join(format!("before-{part}")),
            )
            .unwrap();
        }
        if !deleting {
            fs::write(stage.path().join(part), format!("new {part}")).unwrap();
        }
    }
    let pending = Pending {
        id: id.to_owned(),
        staged: stage
            .path()
            .file_name()
            .unwrap()
            .to_str()
            .unwrap()
            .to_owned(),
        existing,
        deleting,
    };
    fs::write(journal(), serde_json::to_vec(&pending).unwrap()).unwrap();
    stage.keep()
}

#[test]
fn rolls_back_partially_written_and_deleted_pairs_and_is_repeatable() {
    isolated(|_| {
        let profile = super::super::create("Original", "# original\n").unwrap();
        for deleting in [false, true] {
            let stage = interrupt(&profile.id, true, deleting);
            let target = library().join(format!("{}.hosts", profile.id));
            if deleting {
                fs::remove_file(&target).unwrap();
            } else {
                fs::copy(stage.join("hosts"), &target).unwrap();
            }
            recover().unwrap();
            recover().unwrap();
            assert_eq!(
                super::super::read_at(&library(), &profile.id)
                    .unwrap()
                    .revision,
                profile.revision
            );
            assert!(!stage.exists());
        }
    });
}

#[test]
fn removes_a_partial_creation_and_preserves_unknown_external_changes() {
    isolated(|_| {
        fs::create_dir_all(library()).unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let stage = interrupt(&id, false, false);
        let target = library().join(format!("{id}.hosts"));
        fs::copy(stage.join("hosts"), &target).unwrap();
        recover().unwrap();
        assert!(!target.exists());

        let profile = super::super::create("Original", "# original\n").unwrap();
        let stage = interrupt(&profile.id, true, false);
        fs::write(&profile.path, "# external\n").unwrap();
        assert_eq!(recover().unwrap_err(), "HOSTS_PROFILE_CONFLICT");
        assert_eq!(fs::read_to_string(&profile.path).unwrap(), "# external\n");
        assert!(stage.exists());
        assert!(journal().exists());
    });
}
