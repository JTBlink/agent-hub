use super::*;
use tempfile::tempdir;

#[test]
fn creates_renames_and_deletes_real_files_and_directories() {
    let temp = tempdir().unwrap();
    let root = temp.path();
    assert_eq!(
        apply(
            root,
            "",
            FileAction::NewDirectory {
                name: "资料".into()
            }
        )
        .unwrap(),
        "资料"
    );
    assert_eq!(
        apply(
            root,
            "资料",
            FileAction::NewFile {
                name: "notes.md".into()
            }
        )
        .unwrap(),
        "资料/notes.md"
    );
    fs::write(root.join("资料/notes.md"), "preserved").unwrap();
    apply(
        root,
        "资料",
        FileAction::Rename {
            name: "docs".into(),
        },
    )
    .unwrap();
    assert_eq!(
        fs::read_to_string(root.join("docs/notes.md")).unwrap(),
        "preserved"
    );
    apply(
        root,
        "docs/notes.md",
        FileAction::Rename {
            name: "readme.md".into(),
        },
    )
    .unwrap();
    apply(root, "docs", FileAction::Delete).unwrap();
    assert!(!root.join("docs").exists());
}

#[test]
fn refuses_overwrite_including_a_concurrent_rename_destination() {
    let temp = tempdir().unwrap();
    let root = temp.path();
    fs::write(root.join("one"), "one").unwrap();
    fs::write(root.join("two"), "two").unwrap();
    assert!(apply(root, "", FileAction::NewFile { name: "two".into() }).is_err());
    assert!(apply(root, "one", FileAction::Rename { name: "two".into() }).is_err());
    assert!(rename_without_replace(&root.join("one"), &root.join("two")).is_err());
    assert_eq!(fs::read_to_string(root.join("two")).unwrap(), "two");
    assert_eq!(fs::read_to_string(root.join("one")).unwrap(), "one");
}

#[test]
fn protects_root_traversal_names_and_git_metadata() {
    let temp = tempdir().unwrap();
    let root = temp.path();
    fs::create_dir(root.join(".git")).unwrap();
    for name in [
        "",
        ".",
        "..",
        "../outside",
        "/absolute",
        "a/b",
        "a\\b",
        ".GiT",
        "trailing.",
        "bad\0name",
    ] {
        assert!(
            apply(root, "", FileAction::NewFile { name: name.into() }).is_err(),
            "{name}"
        );
    }
    for path in ["", "../outside", ".git", ".git/config", "/absolute"] {
        assert!(apply(root, path, FileAction::Delete).is_err(), "{path}");
        assert!(
            apply(
                root,
                path,
                FileAction::Rename {
                    name: "renamed".into()
                }
            )
            .is_err(),
            "{path}"
        );
    }
    fs::create_dir_all(root.join("docs/nested/.git")).unwrap();
    assert!(apply(root, "docs", FileAction::Delete).is_err());
    assert!(apply(
        root,
        "docs",
        FileAction::Rename {
            name: "moved".into()
        }
    )
    .is_err());
    assert!(root.join("docs/nested/.git").exists());
}

#[cfg(unix)]
#[test]
fn refuses_link_targets_and_ancestors_but_deletes_contained_links_without_following() {
    use std::os::unix::fs::symlink;
    let temp = tempdir().unwrap();
    let root = temp.path().join("root");
    let outside = temp.path().join("outside");
    fs::create_dir(&root).unwrap();
    fs::create_dir(&outside).unwrap();
    fs::write(outside.join("keep"), "keep").unwrap();
    symlink(&outside, root.join("link")).unwrap();
    for path in ["link", "link/keep"] {
        assert!(existing_path(&root, path).is_err());
        assert!(apply(&root, path, FileAction::Delete).is_err());
        assert!(apply(&root, path, FileAction::NewFile { name: "new".into() }).is_err());
    }
    fs::create_dir(root.join("docs")).unwrap();
    symlink(&outside, root.join("docs/link")).unwrap();
    apply(&root, "docs", FileAction::Delete).unwrap();
    assert_eq!(fs::read_to_string(outside.join("keep")).unwrap(), "keep");
}
