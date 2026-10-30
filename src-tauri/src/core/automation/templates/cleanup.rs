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
    fn script(workspace: &Path) -> std::path::PathBuf {
        let file = workspace.join("cleanup.py");
        for (name, content) in super::super::builtin::DISK_CLEANUP_FILES {
            fs::write(workspace.join(name.rsplit('/').next().unwrap()), content).unwrap();
        }
        fs::write(
            &file,
            include_str!("builtin/disk-cleanup/scripts/disk-cleanup.py"),
        )
        .unwrap();
        file
    }
    fn python_command(workspace: &Path) -> std::process::Command {
        let mut command = std::process::Command::new(
            crate::core::automation::native::python_runtime()
                .expect("Python 3 is required to test bundled Python scripts"),
        );
        command.current_dir(workspace);
        command
    }
    fn run(workspace: &Path) -> std::process::Output {
        python_command(workspace)
            .arg(script(workspace))
            .arg("--workspace-only")
            .output()
            .unwrap()
    }

    #[test]
    fn optional_cache_permissions_warn_but_real_failures_keep_nonzero_exit() {
        let root = tempfile::tempdir().unwrap();
        let output = python_command(root.path())
            .arg("-c")
            .arg(include_str!("fixtures/cleanup_permissions.py"))
            .arg(script(root.path()))
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }
    #[test]
    fn user_cache_profiles_formatting_preview_and_safety_use_isolated_trees() {
        let root = tempfile::tempdir().unwrap();
        let output = python_command(root.path())
            .arg("-c")
            .arg(include_str!("fixtures/disk_cleanup_checks.py"))
            .arg(script(root.path()))
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn clears_expired_files_when_directory_entries_have_no_device_id() {
        let root = tempfile::tempdir().unwrap();
        for directory in ["tmp", "logs"] {
            let target = root.path().join(directory);
            fs::create_dir_all(target.join("nested")).unwrap();
            old_file(&target.join("expired.log"));
            old_file(&target.join("nested/expired.log"));
            fs::write(target.join("recent.log"), "keep").unwrap();
        }
        let output = python_command(root.path())
            .arg("-c")
            .arg(include_str!("fixtures/zero_device_entries.py"))
            .arg(script(root.path()))
            .arg("--workspace-only")
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        for directory in ["tmp", "logs"] {
            let target = root.path().join(directory);
            assert!(!target.join("expired.log").exists());
            assert!(!target.join("nested/expired.log").exists());
            assert!(target.join("recent.log").is_file());
        }
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
        assert!(report.contains("清理前磁盘空间："));
        assert!(report.contains("清理后磁盘空间："));
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
