use super::*;
use std::fs;
use tempfile::tempdir;

/// #502: the update tiebreaker looks past dependency installs, while the
/// stored-identity hash keeps seeing them.
#[test]
fn large_payload_hash_stays_compatible_across_sha_backends() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("payload.bin");
    let payload: Vec<u8> = (0..256)
        .map(|byte| byte as u8)
        .collect::<Vec<_>>()
        .repeat(4096);
    std::fs::write(&path, payload).unwrap();
    let entries = [ContentEntry {
        relative_path: "payload.bin".into(),
        path,
        exec_bits: None,
        modified_ms: None,
    }];
    assert_eq!(
        hash_entries(&entries),
        "5d37ac92c6ac77921c2440c7c0276efb7bc843bf04f4db46219ad4865f338d72"
    );
}

#[test]
fn dependency_installs_only_bypass_the_update_tiebreaker() {
    let tmp = tempdir().unwrap();
    fs::write(tmp.path().join("SKILL.md"), "# hello").unwrap();
    let loose = hash_directory_eol_insensitive(tmp.path()).unwrap();
    let strict = hash_directory(tmp.path()).unwrap();

    for dir in [
        "node_modules/pkg",
        "scripts/node_modules/pkg",
        ".venv/lib",
        "venv/lib",
    ] {
        fs::create_dir_all(tmp.path().join(dir)).unwrap();
        fs::write(tmp.path().join(dir).join("index.js"), "x").unwrap();
    }

    assert_eq!(hash_directory_eol_insensitive(tmp.path()).unwrap(), loose);
    assert_ne!(hash_directory(tmp.path()).unwrap(), strict);
}

/// The skip applies below the root: a skill whose own directory happens to
/// be named `venv` still hashes its content.
#[test]
fn a_skill_directory_named_like_a_dependency_dir_is_still_hashed() {
    let tmp = tempdir().unwrap();
    let skill = tmp.path().join("venv");
    fs::create_dir_all(&skill).unwrap();
    fs::write(skill.join("SKILL.md"), "# hello").unwrap();

    assert!(hash_directory_eol_insensitive(&skill).is_ok());
}

/// Project-workspace skills may now be symlinks to the central library
/// (#225). Sync-status classification hashes the project path directly,
/// so hashing through a symlinked root must see the real content.
#[cfg(unix)]
#[test]
fn hash_through_symlinked_root_matches_real_directory() {
    let tmp = tempdir().unwrap();
    let real = tmp.path().join("skill");
    fs::create_dir_all(&real).unwrap();
    fs::write(real.join("SKILL.md"), "# hello").unwrap();
    let link = tmp.path().join("link");
    std::os::unix::fs::symlink(&real, &link).unwrap();

    assert_eq!(
        hash_directory(&link).unwrap(),
        hash_directory(&real).unwrap()
    );
}

/// The case this exists for: the same skill reaching two machines through
/// different pipelines (git checkout on Windows vs our byte copy) holds the
/// same text in two encodings. The byte hash must still see that difference
/// — it is the stored identity — while the tiebreaker must not.
#[test]
fn line_endings_alone_split_the_byte_hash_but_not_the_tiebreaker() {
    let lf = tempdir().unwrap();
    fs::write(lf.path().join("SKILL.md"), "# Skill\nline two\n").unwrap();
    let crlf = tempdir().unwrap();
    fs::write(crlf.path().join("SKILL.md"), "# Skill\r\nline two\r\n").unwrap();

    assert_ne!(
        hash_directory(lf.path()).unwrap(),
        hash_directory(crlf.path()).unwrap(),
        "the byte hash is the stored identity and must stay byte-exact"
    );
    assert_eq!(
        hash_directory_eol_insensitive(lf.path()).unwrap(),
        hash_directory_eol_insensitive(crlf.path()).unwrap()
    );
}

/// The tiebreaker must not become a blanket "everything is the same":
/// a real edit has to survive it, or it would silently suppress updates.
#[test]
fn the_tiebreaker_still_separates_real_edits() {
    let one = tempdir().unwrap();
    fs::write(one.path().join("SKILL.md"), "# Skill\r\nline two\r\n").unwrap();
    let two = tempdir().unwrap();
    fs::write(two.path().join("SKILL.md"), "# Skill\r\nline THREE\r\n").unwrap();

    assert_ne!(
        hash_directory_eol_insensitive(one.path()).unwrap(),
        hash_directory_eol_insensitive(two.path()).unwrap()
    );
}

/// The sniff must cover the whole file, not git's first 8000 bytes. These
/// two binaries put their first NUL past that window and differ only by a
/// `\r`, so a prefix-only sniff folds them together and reports a real
/// difference as "up to date".
#[test]
fn a_binary_whose_first_nul_is_past_8000_bytes_is_still_binary() {
    let mut early = vec![b'A'; 9000];
    early.extend_from_slice(b"\x00\r\ntail");
    let mut late = vec![b'A'; 9000];
    late.extend_from_slice(b"\x00\ntail");

    let one = tempdir().unwrap();
    fs::write(one.path().join("blob.bin"), &early).unwrap();
    let two = tempdir().unwrap();
    fs::write(two.path().join("blob.bin"), &late).unwrap();

    assert_ne!(
        hash_directory_eol_insensitive(one.path()).unwrap(),
        hash_directory_eol_insensitive(two.path()).unwrap()
    );
}

fn entry(relative_path: &str, path: PathBuf) -> ContentEntry {
    ContentEntry {
        relative_path: relative_path.to_string(),
        path,
        exec_bits: None,
        modified_ms: None,
    }
}

/// The tiebreaker only ever *suppresses* an update, so a file it could not
/// read must be an error rather than an empty file — otherwise two
/// unreadable files would hash alike and hide a real change. The byte hash
/// makes the opposite trade deliberately; see the doc comments.
#[test]
fn an_unreadable_file_is_an_error_not_an_empty_one() {
    let tmp = tempdir().unwrap();
    let missing = vec![entry("gone.md", tmp.path().join("gone.md"))];
    let other_missing = vec![entry("gone.md", tmp.path().join("also-gone.md"))];

    assert!(hash_entries_eol_insensitive(&missing).is_err());
    assert_eq!(
        hash_entries(&missing),
        hash_entries(&other_missing),
        "the byte hash folds an unreadable file to nothing — two different \
             unreadable files are indistinguishable to it. That is its existing \
             contract, and the reason the tiebreaker may not share it."
    );
}

/// An unreadable *directory* is the same hazard one level up, and
/// [`list_content_files`] drops it silently. Both trees would then be judged
/// on the readable remainder, and a subtree difference would vanish.
#[cfg(unix)]
#[test]
fn an_untraversable_subdirectory_is_an_error_for_the_tiebreaker() {
    use std::os::unix::fs::PermissionsExt;

    let tmp = tempdir().unwrap();
    fs::write(tmp.path().join("SKILL.md"), "# skill\n").unwrap();
    let locked = tmp.path().join("templates");
    fs::create_dir(&locked).unwrap();
    fs::write(locked.join("inner.md"), "content").unwrap();
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();

    // Root ignores the mode, which would make the assertion below vacuous —
    // so establish that the identity running this test is actually blocked.
    let mode_is_enforced = fs::read_dir(&locked).is_err();
    let strict = hash_directory_eol_insensitive(tmp.path());
    let lossy = list_content_files(tmp.path());
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();

    if mode_is_enforced {
        assert!(
            strict.is_err(),
            "an unreadable subtree must not be reported as absent"
        );
        assert_eq!(
            lossy.len(),
            1,
            "the lossy walk keeps its existing contract: it sees only SKILL.md"
        );
    } else {
        // Say so rather than pass quietly: a green run under an identity
        // that ignores the mode has asserted nothing here.
        eprintln!(
            "WARNING: an_untraversable_subdirectory_is_an_error_for_the_tiebreaker \
                 asserted nothing — this identity can read a 0o000 directory"
        );
    }
}

/// Unframed, a path concatenated straight onto its content lets a rename
/// shift bytes across the boundary: `ab` holding `c\n` and `a` holding
/// `bc\r\n` both produce `abc\n`, so a removed file, an added file and an
/// edit would all read as no difference.
#[test]
fn a_path_cannot_bleed_into_its_content() {
    let tmp = tempdir().unwrap();
    let first = tmp.path().join("first");
    fs::write(&first, "c\n").unwrap();
    let second = tmp.path().join("second");
    fs::write(&second, "bc\r\n").unwrap();

    assert_ne!(
        hash_entries_eol_insensitive(&[entry("ab", first)]).unwrap(),
        hash_entries_eol_insensitive(&[entry("a", second)]).unwrap()
    );
}

/// "No NUL" does not establish text: this payload has none, and folding it
/// would hide a real one-byte difference between two binaries.
#[test]
fn nul_free_binary_content_is_still_not_folded() {
    let one = tempdir().unwrap();
    fs::write(one.path().join("payload.bin"), b"\xff\r\n").unwrap();
    let two = tempdir().unwrap();
    fs::write(two.path().join("payload.bin"), b"\xff\n").unwrap();

    assert_ne!(
        hash_directory_eol_insensitive(one.path()).unwrap(),
        hash_directory_eol_insensitive(two.path()).unwrap()
    );
}

/// A permission-only change must not hide behind the line-ending
/// comparison, the same way it does not hide from the byte hash.
#[cfg(unix)]
#[test]
fn an_executable_bit_change_alone_still_differs() {
    use std::os::unix::fs::PermissionsExt;

    let plain = tempdir().unwrap();
    fs::write(plain.path().join("run.sh"), "echo hi\n").unwrap();
    let executable = tempdir().unwrap();
    let script = executable.path().join("run.sh");
    fs::write(&script, "echo hi\n").unwrap();
    fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();

    assert_ne!(
        hash_directory_eol_insensitive(plain.path()).unwrap(),
        hash_directory_eol_insensitive(executable.path()).unwrap()
    );
}

/// "The hash of nothing" is the same for every empty tree, so a missing
/// library copy would compare equal to an empty source and report a
/// vanished skill as up to date.
#[test]
fn an_empty_or_missing_directory_has_no_tiebreaker_hash() {
    let tmp = tempdir().unwrap();
    assert!(hash_directory_eol_insensitive(&tmp.path().join("nope")).is_err());
    assert!(hash_directory_eol_insensitive(tmp.path()).is_err());
}

/// Two different binaries whose bytes happen to contain `\r\n` must not
/// fold into each other. Without the binary sniff these two files differ
/// only by a `\r` and would hash identically — a real skill ships `.png`
/// and `.pptx` templates, so this is not a theoretical collision.
#[test]
fn binary_content_is_never_folded() {
    let one = tempdir().unwrap();
    fs::write(one.path().join("logo.png"), b"\x89PNG\x00\r\n\x1a\n").unwrap();
    let two = tempdir().unwrap();
    fs::write(two.path().join("logo.png"), b"\x89PNG\x00\n\x1a\n").unwrap();

    assert_ne!(
        hash_directory_eol_insensitive(one.path()).unwrap(),
        hash_directory_eol_insensitive(two.path()).unwrap(),
        "a NUL byte marks these binary; folding them would lose a real difference"
    );
}

/// A lone CR is not a CRLF line ending and must not be dropped, or content
/// that genuinely differs by one would read as identical.
#[test]
fn a_lone_carriage_return_is_left_alone() {
    let with_cr = tempdir().unwrap();
    fs::write(with_cr.path().join("a.txt"), "progress\rdone\r\n").unwrap();
    let without = tempdir().unwrap();
    fs::write(without.path().join("a.txt"), "progressdone\r\n").unwrap();

    assert_ne!(
        hash_directory_eol_insensitive(with_cr.path()).unwrap(),
        hash_directory_eol_insensitive(without.path()).unwrap()
    );
}

#[test]
fn hash_deterministic_same_content() {
    let tmp1 = tempdir().unwrap();
    fs::write(tmp1.path().join("a.txt"), "hello").unwrap();
    fs::write(tmp1.path().join("b.txt"), "world").unwrap();

    let tmp2 = tempdir().unwrap();
    fs::write(tmp2.path().join("a.txt"), "hello").unwrap();
    fs::write(tmp2.path().join("b.txt"), "world").unwrap();

    let h1 = hash_directory(tmp1.path()).unwrap();
    let h2 = hash_directory(tmp2.path()).unwrap();
    assert_eq!(h1, h2);
}

#[test]
fn hash_differs_with_different_content() {
    let tmp1 = tempdir().unwrap();
    fs::write(tmp1.path().join("a.txt"), "hello").unwrap();

    let tmp2 = tempdir().unwrap();
    fs::write(tmp2.path().join("a.txt"), "world").unwrap();

    let h1 = hash_directory(tmp1.path()).unwrap();
    let h2 = hash_directory(tmp2.path()).unwrap();
    assert_ne!(h1, h2);
}

#[test]
fn hash_ignores_dot_git() {
    let tmp = tempdir().unwrap();
    fs::write(tmp.path().join("a.txt"), "content").unwrap();
    let h1 = hash_directory(tmp.path()).unwrap();

    // Add .git directory — hash should not change
    fs::create_dir_all(tmp.path().join(".git")).unwrap();
    fs::write(tmp.path().join(".git/config"), "git stuff").unwrap();
    let h2 = hash_directory(tmp.path()).unwrap();

    assert_eq!(h1, h2);
}

#[test]
fn hash_ignores_ds_store() {
    let tmp = tempdir().unwrap();
    fs::write(tmp.path().join("a.txt"), "content").unwrap();
    let h1 = hash_directory(tmp.path()).unwrap();

    fs::write(tmp.path().join(".DS_Store"), "binary stuff").unwrap();
    let h2 = hash_directory(tmp.path()).unwrap();

    assert_eq!(h1, h2);
}

#[test]
fn hash_ignores_pycache() {
    let tmp = tempdir().unwrap();
    fs::write(tmp.path().join("run.py"), "print('hi')").unwrap();
    let h1 = hash_directory(tmp.path()).unwrap();

    // Running the script generates a __pycache__ dir — hash must not change.
    fs::create_dir_all(tmp.path().join("__pycache__")).unwrap();
    fs::write(
        tmp.path().join("__pycache__/run.cpython-311.pyc"),
        "bytecode",
    )
    .unwrap();
    let h2 = hash_directory(tmp.path()).unwrap();

    assert_eq!(h1, h2);
}

#[test]
fn hash_ignores_loose_pyc() {
    let tmp = tempdir().unwrap();
    fs::write(tmp.path().join("a.py"), "x = 1").unwrap();
    let h1 = hash_directory(tmp.path()).unwrap();

    // A .pyc sitting next to its source (not under __pycache__) is excluded too.
    fs::write(tmp.path().join("a.pyc"), "bytecode").unwrap();
    let h2 = hash_directory(tmp.path()).unwrap();

    assert_eq!(h1, h2);
}

#[test]
fn hash_empty_directory() {
    let tmp = tempdir().unwrap();
    let h = hash_directory(tmp.path()).unwrap();
    // SHA256 of empty input
    assert_eq!(
        h,
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
}

#[test]
fn hash_includes_subdirectories() {
    let tmp = tempdir().unwrap();
    fs::create_dir_all(tmp.path().join("sub")).unwrap();
    fs::write(tmp.path().join("sub/file.md"), "nested").unwrap();

    let h1 = hash_directory(tmp.path()).unwrap();

    // Different subdir name → different hash
    let tmp2 = tempdir().unwrap();
    fs::create_dir_all(tmp2.path().join("other")).unwrap();
    fs::write(tmp2.path().join("other/file.md"), "nested").unwrap();

    let h2 = hash_directory(tmp2.path()).unwrap();
    assert_ne!(h1, h2);
}

#[test]
fn list_content_files_sorted_with_relative_paths_and_ignores() {
    let tmp = tempdir().unwrap();
    fs::write(tmp.path().join("b.txt"), "b").unwrap();
    fs::write(tmp.path().join("a.txt"), "a").unwrap();
    fs::create_dir_all(tmp.path().join("sub")).unwrap();
    fs::write(tmp.path().join("sub/c.md"), "c").unwrap();
    fs::write(tmp.path().join(".DS_Store"), "junk").unwrap();

    let entries = list_content_files(tmp.path());
    let rels: Vec<_> = entries.iter().map(|e| e.relative_path.clone()).collect();
    // Sorted by path, ignore-listed files excluded, subdirs included.
    assert_eq!(rels, vec!["a.txt", "b.txt", "sub/c.md"]);
}

#[test]
fn latest_modified_ms_reflects_content_files_and_ignores_empty() {
    let tmp = tempdir().unwrap();
    fs::write(tmp.path().join("a.txt"), "a").unwrap();
    fs::create_dir_all(tmp.path().join("sub")).unwrap();
    fs::write(tmp.path().join("sub/b.md"), "b").unwrap();
    fs::write(tmp.path().join(".DS_Store"), "junk").unwrap();

    let entries = list_content_files(tmp.path());
    // Matches the max mtime over exactly the enumerated (non-ignored)
    // content files, computed from the same single walk with no extra stat.
    assert_eq!(
        latest_modified_ms(&entries),
        entries.iter().filter_map(|e| e.modified_ms).max()
    );
    assert!(latest_modified_ms(&entries).is_some());

    // No content files → no timestamp.
    let empty = tempdir().unwrap();
    assert_eq!(latest_modified_ms(&list_content_files(empty.path())), None);
}

#[test]
fn hash_entries_matches_hash_directory() {
    let tmp = tempdir().unwrap();
    fs::write(tmp.path().join("a.txt"), "hello").unwrap();
    fs::create_dir_all(tmp.path().join("sub")).unwrap();
    fs::write(tmp.path().join("sub/c.md"), "nested").unwrap();

    // The split-out entry hasher must agree with the whole-directory hash.
    assert_eq!(
        hash_entries(&list_content_files(tmp.path())),
        hash_directory(tmp.path()).unwrap()
    );
}

#[cfg(unix)]
#[test]
fn list_content_files_reports_executable_bit() {
    use std::os::unix::fs::PermissionsExt;
    let tmp = tempdir().unwrap();
    let script = tmp.path().join("run.sh");
    fs::write(&script, "#!/bin/sh\n").unwrap();
    fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
    fs::write(tmp.path().join("plain.txt"), "x").unwrap();

    let entries = list_content_files(tmp.path());
    let by_name = |name: &str| entries.iter().find(|e| e.relative_path == name).unwrap();
    assert!(by_name("run.sh").is_executable());
    assert!(!by_name("plain.txt").is_executable());
}
