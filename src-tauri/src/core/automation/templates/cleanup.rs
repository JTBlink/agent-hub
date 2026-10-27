#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::Path,
        time::{Duration, SystemTime},
    };

    fn old_file(path: &Path) {
        aged_file_hours(path, 90 * 24);
    }
    fn aged_file_hours(path: &Path, hours: u64) {
        fs::write(path, "old temporary content").unwrap();
        fs::File::options()
            .write(true)
            .open(path)
            .unwrap()
            .set_times(
                fs::FileTimes::new()
                    .set_modified(SystemTime::now() - Duration::from_secs(hours * 3600)),
            )
            .unwrap();
    }
    fn run(workspace: &Path) -> std::process::Output {
        let file = workspace.join("cleanup.py");
        fs::write(&file, include_str!("builtin/disk-cleanup/disk-cleanup.py")).unwrap();
        std::process::Command::new(
            crate::core::automation::native::python_runtime()
                .expect("Python 3 is required to test bundled Python scripts"),
        )
        .arg(file)
        .current_dir(workspace)
        .output()
        .unwrap()
    }

    #[test]
    fn clears_both_directories_in_one_run_with_independent_retention_and_is_repeatable() {
        let root = tempfile::tempdir().unwrap();
        for (directory, days) in [("tmp", 7u32), ("logs", 30)] {
            let target = root.path().join(directory);
            fs::create_dir_all(target.join("nested space/empty")).unwrap();
            old_file(&target.join("old ' quoted.tmp"));
            old_file(&target.join("nested space/old.log"));
            fs::write(target.join("recent.log"), "keep recent content").unwrap();
            aged_file_hours(&target.join("two-weeks-old.log"), 15 * 24);
            aged_file_hours(&target.join("just-expired.log"), u64::from(days) * 24 + 1);
            aged_file_hours(
                &target.join("within-retention.log"),
                u64::from(days) * 24 - 1,
            );
        }
        old_file(&root.path().join("outside.log"));
        let output = run(root.path());
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let report = String::from_utf8_lossy(&output.stdout);
        assert!(report.contains("Disk space before cleanup:"));
        assert!(report.contains("Disk space after cleanup:"));
        for directory in ["tmp", "logs"] {
            let target = root.path().join(directory);
            assert!(!target.join("old ' quoted.tmp").exists());
            assert!(!target.join("nested space/old.log").exists());
            assert!(target.join("recent.log").is_file());
            assert!(!target.join("just-expired.log").exists());
            assert!(target.join("within-retention.log").exists());
            assert_eq!(
                target.join("two-weeks-old.log").exists(),
                directory == "logs"
            );
            assert!(target.join("nested space/empty").is_dir());
            assert!(root.path().join("outside.log").is_file());
        }
        assert!(run(root.path()).status.success());
    }
    #[test]
    fn missing_one_directory_does_not_skip_the_other() {
        for directory in ["tmp", "logs"] {
            let root = tempfile::tempdir().unwrap();
            let target = root.path().join(directory);
            fs::create_dir(&target).unwrap();
            old_file(&target.join("expired.log"));
            assert!(run(root.path()).status.success());
            assert!(!target.join("expired.log").exists());
        }
    }
    #[test]
    fn missing_directories_are_noops_and_file_targets_are_rejected() {
        let root = tempfile::tempdir().unwrap();
        assert!(run(root.path()).status.success());
        assert!(!root.path().join("tmp").exists());
        old_file(&root.path().join("tmp"));
        assert!(!run(root.path()).status.success());
        assert!(root.path().join("tmp").is_file());
    }
    #[cfg(unix)]
    #[test]
    fn refuses_root_symlinks_and_never_traverses_nested_links() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        old_file(&outside.path().join("preserved.log"));
        std::os::unix::fs::symlink(outside.path(), root.path().join("tmp")).unwrap();
        assert!(!run(root.path()).status.success());
        fs::remove_file(root.path().join("tmp")).unwrap();
        fs::create_dir(root.path().join("tmp")).unwrap();
        std::os::unix::fs::symlink(outside.path(), root.path().join("tmp/linked-dir")).unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("preserved.log"),
            root.path().join("tmp/linked-file"),
        )
        .unwrap();
        assert!(run(root.path()).status.success());
        assert!(outside.path().join("preserved.log").is_file());
        assert!(root.path().join("tmp/linked-file").is_symlink());
    }
}
