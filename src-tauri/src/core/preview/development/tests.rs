use super::*;

#[test]
fn detects_nearest_vite_package_and_keeps_static_html_static() {
    let root = tempfile::tempdir().unwrap();
    std::fs::write(root.path().join("index.html"), "<h1>Static</h1>").unwrap();
    assert!(package_directory(root.path(), "index.html")
        .unwrap()
        .is_none());
    std::fs::write(
        root.path().join("package.json"),
        r#"{"scripts":{"dev":"vite"}}"#,
    )
    .unwrap();
    assert_eq!(
        package_directory(root.path(), "index.html").unwrap(),
        Some(root.path().to_path_buf())
    );
    std::fs::create_dir(root.path().join("nested")).unwrap();
    std::fs::write(
        root.path().join("nested/package.json"),
        r#"{"scripts":{"dev":"other"}}"#,
    )
    .unwrap();
    std::fs::write(root.path().join("nested/index.html"), "<h1>Nested</h1>").unwrap();
    assert!(package_directory(root.path(), "nested/index.html")
        .unwrap()
        .is_none());
}

#[test]
fn starts_in_the_package_directory_with_an_explicit_loopback_port() {
    let root = tempfile::tempdir().unwrap();
    std::fs::write(root.path().join("index.html"), "<div id='root'></div>").unwrap();
    std::fs::write(
        root.path().join("package.json"),
        r#"{"scripts":{"dev":"vite"}}"#,
    )
    .unwrap();
    let launch = DevelopmentLaunch {
        relative_path: "index.html".into(),
        port: 54321,
    };
    let (directory, command) = command(root.path(), &launch).unwrap();
    assert_eq!(directory, root.path());
    let args = command.get_argv();
    assert!(args.iter().any(|arg| arg == "--strictPort"));
    assert!(args.iter().any(|arg| arg == "127.0.0.1"));
    assert!(args.iter().any(|arg| arg == "54321"));
    assert!(package_directory(root.path(), "../index.html").is_err());
}
