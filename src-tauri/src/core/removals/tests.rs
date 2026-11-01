use super::*;
use tempfile::TempDir;

fn write(path: &Path, body: &str) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, body).unwrap();
}

/// The reported case: a skill wrote a template into its own folder, and the
/// next update took it away.
#[test]
fn reports_a_file_the_new_version_does_not_have() {
    let tmp = TempDir::new().unwrap();
    let current = tmp.path().join("current");
    let replacement = tmp.path().join("new");
    write(&current.join("SKILL.md"), "v1");
    write(&current.join("templates/default.pptx"), "upstream");
    write(&current.join("templates/mine.pptx"), "user work");
    write(&replacement.join("SKILL.md"), "v2");
    write(&replacement.join("templates/default.pptx"), "upstream v2");

    assert_eq!(
        removed_paths(&current, &replacement).unwrap(),
        vec!["templates/mine.pptx"]
    );
}

/// An update changes files; that is the point. Only absence is news.
#[test]
fn says_nothing_when_every_path_survives() {
    let tmp = TempDir::new().unwrap();
    let current = tmp.path().join("current");
    let replacement = tmp.path().join("new");
    write(&current.join("SKILL.md"), "v1");
    write(&current.join("scripts/run.py"), "old");
    write(&replacement.join("SKILL.md"), "v2 — rewritten");
    write(&replacement.join("scripts/run.py"), "new");
    write(&replacement.join("scripts/extra.py"), "added upstream");

    assert!(removed_paths(&current, &replacement).unwrap().is_empty());
}

/// One line the user can act on, not a wall of object files.
#[test]
fn rolls_up_a_directory_the_new_version_drops_entirely() {
    let tmp = TempDir::new().unwrap();
    let current = tmp.path().join("current");
    let replacement = tmp.path().join("new");
    write(&current.join("SKILL.md"), "v1");
    write(&current.join(".git/objects/aa/bb"), "x");
    write(&current.join(".git/HEAD"), "ref");
    write(&current.join("templates/a.pptx"), "x");
    write(&current.join("templates/b.pptx"), "x");
    write(&replacement.join("SKILL.md"), "v2");

    assert_eq!(
        removed_paths(&current, &replacement).unwrap(),
        vec![".git/", "templates/"]
    );
}

/// Compiled bytecode comes back on its own; a `.gitignore` does not.
#[test]
fn skips_regenerable_artifacts_but_not_dotfiles_in_general() {
    let tmp = TempDir::new().unwrap();
    let current = tmp.path().join("current");
    let replacement = tmp.path().join("new");
    write(&current.join("SKILL.md"), "v1");
    write(&current.join("scripts/__pycache__/m.cpython-311.pyc"), "x");
    write(&current.join("stray.pyc"), "x");
    write(&current.join(".DS_Store"), "x");
    write(&current.join(".gitignore"), "mine");
    write(&replacement.join("SKILL.md"), "v2");

    assert_eq!(
        removed_paths(&current, &replacement).unwrap(),
        vec![".gitignore", "scripts/"]
    );
}

/// Replacing a file with a directory of the same name still takes the
/// file's contents away, and vice versa.
#[test]
fn a_path_that_changes_shape_counts_as_removed() {
    let tmp = TempDir::new().unwrap();
    let current = tmp.path().join("current");
    let replacement = tmp.path().join("new");
    write(&current.join("thing"), "a file the user edited");
    write(&current.join("other/inner.txt"), "x");
    write(&replacement.join("thing/inner.txt"), "now a directory");
    write(&replacement.join("other"), "now a file");

    assert_eq!(
        removed_paths(&current, &replacement).unwrap(),
        vec!["other/", "thing"]
    );
}

#[test]
fn an_absent_current_directory_reports_nothing() {
    let tmp = TempDir::new().unwrap();
    assert!(removed_paths(&tmp.path().join("gone"), tmp.path())
        .unwrap()
        .is_empty());
}

/// A path that can be neither confirmed present nor confirmed absent must
/// never come back as "nothing will be lost" — that is the exact failure
/// this exists to prevent. Driven by pointing at a *file* where a directory
/// belongs.
///
/// The platforms refuse differently, and both are safe. Unix reports
/// `ENOTDIR`, which is neither presence nor absence, so the walk gives up.
/// Windows maps the same lookup to `ERROR_PATH_NOT_FOUND`, which arrives as
/// `NotFound`, so the path reads as absent and is listed as about to go.
/// The update is held back either way; what neither may do is answer empty.
#[test]
fn never_answers_nothing_will_be_lost_when_a_path_cannot_be_classified() {
    let tmp = TempDir::new().unwrap();
    let current = tmp.path().join("current");
    write(&current.join("SKILL.md"), "v1");
    let replacement = tmp.path().join("not-a-directory");
    write(&replacement, "this is a file");

    match removed_paths(&current, &replacement) {
        Err(err) => assert!(
            format!("{err:#}").contains("survives the update"),
            "refused, but not for the reason expected: {err:#}"
        ),
        Ok(reported) => assert!(
            reported.iter().any(|p| p == "SKILL.md"),
            "an unclassifiable path was reported as safe: {reported:?}"
        ),
    }
}

#[cfg(unix)]
#[test]
fn a_symlink_the_new_version_lacks_is_reported() {
    let tmp = TempDir::new().unwrap();
    let current = tmp.path().join("current");
    let replacement = tmp.path().join("new");
    std::fs::create_dir_all(&current).unwrap();
    std::fs::create_dir_all(&replacement).unwrap();
    std::os::unix::fs::symlink("/somewhere", current.join("link")).unwrap();

    assert_eq!(removed_paths(&current, &replacement).unwrap(), vec!["link"]);
}
