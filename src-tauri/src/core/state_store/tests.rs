#[test]
fn execution_locks_release_on_process_exit_and_transactions_preserve_namespaces() {
    let root = tempfile::tempdir().unwrap();
    let module = root.path().join("store.py");
    std::fs::write(&module, include_str!("store.py")).unwrap();
    let result = std::process::Command::new(crate::core::python_support::interpreter().unwrap())
        .arg("-c")
        .arg(include_str!("checks.py"))
        .arg(module)
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}\n{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
}
