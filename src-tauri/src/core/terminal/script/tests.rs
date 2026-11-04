use super::*;

#[test]
fn passes_script_names_as_literal_arguments_without_executable_permission() {
    let root = tempfile::tempdir().unwrap();
    let name = "script with 'quotes' $(ignored).sh";
    std::fs::write(root.path().join(name), "printf 'script-ok'").unwrap();
    let command = prepare_script(root.path(), name).unwrap();
    let args = command.get_argv();
    assert_eq!(args[0], "bash");
    assert_eq!(args[1], "--");
    assert_eq!(args[2], root.path().join(name));
}

#[test]
fn rejects_missing_files_directories_traversal_and_unsupported_types() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("folder.sh")).unwrap();
    std::fs::write(root.path().join("notes.txt"), "text").unwrap();
    for path in ["missing.sh", "folder.sh", "../escape.sh", "notes.txt"] {
        assert!(prepare_script(root.path(), path).is_err(), "{path}");
    }
}

#[cfg(unix)]
#[test]
fn rejects_linked_scripts_and_windows_batch_files() {
    let root = tempfile::tempdir().unwrap();
    std::fs::write(root.path().join("run.sh"), "exit 0").unwrap();
    std::os::unix::fs::symlink(root.path().join("run.sh"), root.path().join("link.sh")).unwrap();
    assert!(prepare_script(root.path(), "link.sh").is_err());
    std::fs::write(root.path().join("run.bat"), "echo hello").unwrap();
    assert!(prepare_script(root.path(), "run.bat").is_err());
}
