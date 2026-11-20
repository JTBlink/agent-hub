use super::*;
use std::path::Path;

fn executable(path: &Path) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, "fixture").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
}
#[test]
fn preferred_paths_follow_user_order_and_select_newest_existing_version() {
    let temp = tempfile::tempdir().unwrap();
    for release in ["1.9.0", "1.10.0"] {
        executable(&temp.path().join(release).join("glab"));
    }
    std::fs::create_dir(temp.path().join("2.0.0")).unwrap();
    let pattern = temp.path().join("*/glab").to_string_lossy().into_owned();
    let found = paths::preferred(std::slice::from_ref(&pattern))
        .unwrap()
        .unwrap();
    assert_eq!(found.path, temp.path().join("1.10.0/glab"));
    // Removing the version previously selected must resolve the next available version.
    std::fs::remove_file(&found.path).unwrap();
    assert_eq!(
        paths::preferred(std::slice::from_ref(&pattern))
            .unwrap()
            .unwrap()
            .path,
        temp.path().join("1.9.0/glab")
    );
    let first = temp.path().join("preferred/glab");
    executable(&first);
    assert_eq!(
        paths::preferred(&[first.to_string_lossy().into_owned(), pattern])
            .unwrap()
            .unwrap()
            .path,
        first
    );
}
#[test]
fn executable_directory_and_missing_custom_paths_are_supported() {
    let temp = tempfile::tempdir().unwrap();
    let bin = temp
        .path()
        .join(if cfg!(windows) { "glab.exe" } else { "glab" });
    executable(&bin);
    assert_eq!(
        paths::launcher(temp.path(), "custom")
            .unwrap()
            .unwrap()
            .path,
        bin
    );
    assert!(paths::preferred(&[temp
        .path()
        .join("missing/*/glab")
        .to_string_lossy()
        .into_owned()])
    .unwrap()
    .is_none());
    assert!(paths::validate(&["relative/glab".into()]).is_err());
    assert!(paths::validate(&["/**/glab".into()]).is_err());
}
#[test]
fn settings_persist_only_custom_search_paths_and_cancel_before_downloading() {
    let temp = tempfile::tempdir().unwrap();
    let cli = GlabCli {
        root: temp.path().join("tools"),
    };
    let path = temp.path().join("bin/glab");
    executable(&path);
    let preferences = Preferences {
        search_paths: vec![path.to_string_lossy().into_owned()],
    };
    cli.save(preferences.clone()).unwrap();
    assert_eq!(
        cli.preferences().unwrap().search_paths,
        preferences.search_paths
    );
    assert!(cli
        .resolve(&AtomicBool::new(true), None)
        .unwrap_err()
        .to_string()
        .contains("cancelled"));
    let invalid = Preferences {
        search_paths: vec!["relative/path".into()],
    };
    assert!(cli.save(invalid).is_err());
    assert_eq!(
        cli.preferences().unwrap().search_paths,
        preferences.search_paths
    );
    assert!(!cli.root.join("current.json").exists());
}
#[test]
fn script_launchers_keep_the_path_as_one_argument_and_require_node() {
    let temp = tempfile::tempdir().unwrap();
    let script = temp.path().join("version with spaces/glab.mjs");
    executable(&script);
    let node = temp.path().join("node");
    executable(&node);
    let found = paths::launcher_with_node(&script, "custom", || Some(node.clone()))
        .unwrap()
        .unwrap();
    assert_eq!(found.launcher.program, node.to_string_lossy());
    assert_eq!(found.launcher.args, vec![script.to_string_lossy()]);
    assert!(paths::launcher_with_node(&script, "custom", || None)
        .unwrap()
        .is_none());
}
#[cfg(unix)]
#[test]
fn task_transport_rediscovers_custom_cli_after_a_version_is_removed() {
    use crate::core::{central_repo, platforms::cli::PlatformCli, task_browser::Provider};
    let _lock = central_repo::test_base_dir_lock();
    let temp = tempfile::tempdir().unwrap();
    central_repo::set_test_home_dir_override(Some(temp.path().into()));
    struct Reset;
    impl Drop for Reset {
        fn drop(&mut self) {
            central_repo::set_test_home_dir_override(None);
        }
    }
    let _reset = Reset;
    for release in ["1.9.0", "1.10.0"] {
        let path = temp.path().join(release).join("glab");
        executable(&path);
        std::fs::write(
            path,
            format!("#!/bin/sh\nprintf '{{\"release\":\"{release}\"}}'\n"),
        )
        .unwrap();
    }
    GlabCli::default()
        .save(Preferences {
            search_paths: vec![temp.path().join("*/glab").to_string_lossy().into_owned()],
        })
        .unwrap();
    let cli = PlatformCli {
        provider: Provider::Gitlab,
        host: "git.example.invalid",
        launcher: None,
        cwd: temp.path(),
        proxy_url: None,
    };
    let args = vec!["api".into(), "user".into()];
    assert!(cli
        .run(&args, &AtomicBool::new(false))
        .unwrap()
        .contains("1.10.0"));
    std::fs::remove_file(temp.path().join("1.10.0/glab")).unwrap();
    assert!(cli
        .run(&args, &AtomicBool::new(false))
        .unwrap()
        .contains("1.9.0"));
    assert!(cli.run(&args, &AtomicBool::new(true)).is_err());
}
