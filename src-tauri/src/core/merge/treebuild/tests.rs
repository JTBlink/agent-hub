use super::*;

fn test_repo() -> (tempfile::TempDir, Repository) {
    let tmp = tempfile::tempdir().unwrap();
    let repo = Repository::init(tmp.path()).unwrap();
    (tmp, repo)
}

fn blob(repo: &Repository, content: &str) -> Oid {
    repo.blob(content.as_bytes()).unwrap()
}

fn tree_of(repo: &Repository, entries: &[(&str, TreeEdit)]) -> Oid {
    let edits: BTreeMap<String, TreeEdit> =
        entries.iter().map(|(p, e)| (p.to_string(), *e)).collect();
    apply_tree_edits(repo, None, &edits).unwrap()
}

fn entry_kind(repo: &Repository, root: Oid, path: &str) -> Option<ObjectType> {
    let tree = repo.find_tree(root).unwrap();
    tree.get_path(std::path::Path::new(path)).ok()?.kind()
}

#[test]
fn builds_nested_paths_and_prunes_empty_dirs() {
    let (_tmp, repo) = test_repo();
    let b = blob(&repo, "hello");
    let root = tree_of(
        &repo,
        &[(
            "a/b/c.txt",
            TreeEdit::PutBlob {
                oid: b,
                mode: 0o100644,
            },
        )],
    );
    assert_eq!(entry_kind(&repo, root, "a/b/c.txt"), Some(ObjectType::Blob));

    // Removing the only file prunes the whole empty chain.
    let mut edits = BTreeMap::new();
    edits.insert("a/b/c.txt".to_string(), TreeEdit::Remove);
    let base = repo.find_tree(root).unwrap();
    let new_root = apply_tree_edits(&repo, Some(&base), &edits).unwrap();
    assert_eq!(repo.find_tree(new_root).unwrap().len(), 0);
}

#[test]
fn put_tree_attaches_subtree_directly() {
    let (_tmp, repo) = test_repo();
    let inner = tree_of(
        &repo,
        &[(
            "SKILL.md",
            TreeEdit::PutBlob {
                oid: blob(&repo, "skill"),
                mode: 0o100644,
            },
        )],
    );
    let root = tree_of(
        &repo,
        &[("group/my-skill", TreeEdit::PutTree { oid: inner })],
    );
    assert_eq!(
        entry_kind(&repo, root, "group/my-skill/SKILL.md"),
        Some(ObjectType::Blob)
    );
}

#[test]
fn blob_to_tree_and_tree_to_blob_type_changes() {
    let (_tmp, repo) = test_repo();
    let file = blob(&repo, "was a file");
    let root = tree_of(
        &repo,
        &[(
            "thing",
            TreeEdit::PutBlob {
                oid: file,
                mode: 0o100644,
            },
        )],
    );
    let base = repo.find_tree(root).unwrap();

    // blob → tree via a nested edit below the old blob path
    let mut edits = BTreeMap::new();
    edits.insert(
        "thing/SKILL.md".to_string(),
        TreeEdit::PutBlob {
            oid: blob(&repo, "now a dir"),
            mode: 0o100644,
        },
    );
    let root2 = apply_tree_edits(&repo, Some(&base), &edits).unwrap();
    assert_eq!(entry_kind(&repo, root2, "thing"), Some(ObjectType::Tree));
    assert_eq!(
        entry_kind(&repo, root2, "thing/SKILL.md"),
        Some(ObjectType::Blob)
    );

    // tree → blob via PutBlob at the old dir path
    let base2 = repo.find_tree(root2).unwrap();
    let mut edits = BTreeMap::new();
    edits.insert(
        "thing".to_string(),
        TreeEdit::PutBlob {
            oid: blob(&repo, "file again"),
            mode: 0o100644,
        },
    );
    let root3 = apply_tree_edits(&repo, Some(&base2), &edits).unwrap();
    assert_eq!(entry_kind(&repo, root3, "thing"), Some(ObjectType::Blob));
}

#[test]
fn nested_put_under_removed_dir_rebuilds_from_scratch() {
    let (_tmp, repo) = test_repo();
    // Old skill dir "spot" with two files.
    let root = tree_of(
        &repo,
        &[
            (
                "spot/SKILL.md",
                TreeEdit::PutBlob {
                    oid: blob(&repo, "old"),
                    mode: 0o100644,
                },
            ),
            (
                "spot/extra.md",
                TreeEdit::PutBlob {
                    oid: blob(&repo, "extra"),
                    mode: 0o100644,
                },
            ),
        ],
    );
    let base = repo.find_tree(root).unwrap();

    // The skill moves away (Remove spot) while a residual file lands at
    // spot/readme.txt. The old skill files must NOT leak through.
    let mut edits = BTreeMap::new();
    edits.insert("spot".to_string(), TreeEdit::Remove);
    edits.insert(
        "spot/readme.txt".to_string(),
        TreeEdit::PutBlob {
            oid: blob(&repo, "note"),
            mode: 0o100644,
        },
    );
    // Both key orders through insert_edit are covered because the flat
    // map sorts "spot" before "spot/readme.txt".
    let new_root = apply_tree_edits(&repo, Some(&base), &edits).unwrap();
    assert_eq!(
        entry_kind(&repo, new_root, "spot/readme.txt"),
        Some(ObjectType::Blob)
    );
    assert_eq!(entry_kind(&repo, new_root, "spot/SKILL.md"), None);
    assert_eq!(entry_kind(&repo, new_root, "spot/extra.md"), None);
}

#[test]
fn put_overwrites_remove_when_planner_replaces_a_path() {
    let (_tmp, repo) = test_repo();
    let old = tree_of(
        &repo,
        &[(
            "spot/SKILL.md",
            TreeEdit::PutBlob {
                oid: blob(&repo, "old"),
                mode: 0o100644,
            },
        )],
    );
    let incoming = tree_of(
        &repo,
        &[(
            "SKILL.md",
            TreeEdit::PutBlob {
                oid: blob(&repo, "new"),
                mode: 0o100644,
            },
        )],
    );
    let base = repo.find_tree(old).unwrap();
    // Planner convention: removes first, puts overwrite the same key.
    let mut flat: BTreeMap<String, TreeEdit> = BTreeMap::new();
    flat.insert("spot".to_string(), TreeEdit::Remove);
    flat.insert("spot".to_string(), TreeEdit::PutTree { oid: incoming });
    let root = apply_tree_edits(&repo, Some(&base), &flat).unwrap();
    let tree = repo.find_tree(root).unwrap();
    let entry = tree
        .get_path(std::path::Path::new("spot/SKILL.md"))
        .unwrap();
    assert_eq!(repo.find_blob(entry.id()).unwrap().content(), b"new");
}

#[test]
fn untouched_siblings_survive() {
    let (_tmp, repo) = test_repo();
    let root = tree_of(
        &repo,
        &[
            (
                "keep.txt",
                TreeEdit::PutBlob {
                    oid: blob(&repo, "keep"),
                    mode: 0o100644,
                },
            ),
            (
                "dir/a.txt",
                TreeEdit::PutBlob {
                    oid: blob(&repo, "a"),
                    mode: 0o100644,
                },
            ),
            (
                "dir/b.txt",
                TreeEdit::PutBlob {
                    oid: blob(&repo, "b"),
                    mode: 0o100644,
                },
            ),
        ],
    );
    let base = repo.find_tree(root).unwrap();
    let mut edits = BTreeMap::new();
    edits.insert("dir/a.txt".to_string(), TreeEdit::Remove);
    let new_root = apply_tree_edits(&repo, Some(&base), &edits).unwrap();
    assert_eq!(
        entry_kind(&repo, new_root, "keep.txt"),
        Some(ObjectType::Blob)
    );
    assert_eq!(
        entry_kind(&repo, new_root, "dir/b.txt"),
        Some(ObjectType::Blob)
    );
    assert_eq!(entry_kind(&repo, new_root, "dir/a.txt"), None);
}
